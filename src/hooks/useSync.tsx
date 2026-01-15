/**
 * Sync Context and Hook
 * Provides sync state management and controls for the Firehose sync service
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getFirehoseSyncService, type SyncStatus, type SyncState } from '../services/firehoseSync'
import { syncPendingRecipes } from '../services/pendingSync'
import { useAuth } from './useAuth'

interface SyncContextValue {
  status: SyncStatus
  syncState: SyncState | null
  startSync: () => Promise<void>
  stopSync: () => void
  syncPending: () => Promise<void>
  isOnline: boolean
}

const SyncContext = createContext<SyncContextValue | null>(null)

/**
 * SyncProvider component
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const syncServiceRef = useRef(getFirehoseSyncService())
  const intervalRef = useRef<number | null>(null)

  // Initialize sync service with callbacks
  useEffect(() => {
    syncServiceRef.current.initialize({
      onStatusChange: (newStatus) => {
        setStatus(newStatus)
      },
      onRecipeUpdated: () => {
        // Refresh sync state when recipe is updated
        syncServiceRef.current.getSyncState().then(setSyncState).catch(console.error)
      },
      onRecipeDeleted: () => {
        // Refresh sync state when recipe is deleted
        syncServiceRef.current.getSyncState().then(setSyncState).catch(console.error)
      },
      onCollectionUpdated: () => {
        // Refresh sync state when collection is updated
        syncServiceRef.current.getSyncState().then(setSyncState).catch(console.error)
      },
      onCollectionDeleted: () => {
        // Refresh sync state when collection is deleted
        syncServiceRef.current.getSyncState().then(setSyncState).catch(console.error)
      },
      onError: (error) => {
        console.error('Sync error:', error)
      },
    })
  }, [])

  // Update sync state periodically
  useEffect(() => {
    const updateSyncState = async () => {
      try {
        const state = await syncServiceRef.current.getSyncState()
        setSyncState(state)
        setStatus(state.status)
      } catch (error) {
        console.error('Failed to get sync state:', error)
      }
    }

    // Update immediately
    updateSyncState()

    // Update every 5 seconds
    intervalRef.current = window.setInterval(updateSyncState, 5000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Try to sync pending items when coming back online
      if (isAuthenticated && status === 'paused') {
        syncPendingRecipes().catch(console.error)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isAuthenticated, status])

  // Handle visibility change (pause when tab is inactive)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        syncServiceRef.current.pause()
      } else if (isAuthenticated && isOnline) {
        syncServiceRef.current.resume().catch(console.error)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated, isOnline])

  // Start sync when authenticated
  useEffect(() => {
    if (isAuthenticated && isOnline) {
      syncServiceRef.current
        .start()
        .catch((error) => {
          console.error('Failed to start sync:', error)
        })
    } else {
      syncServiceRef.current.stop()
    }

    return () => {
      syncServiceRef.current.stop()
    }
  }, [isAuthenticated, isOnline])

  const startSync = useCallback(async () => {
    await syncServiceRef.current.start()
    const state = await syncServiceRef.current.getSyncState()
    setSyncState(state)
    setStatus(state.status)
  }, [])

  const stopSync = useCallback(() => {
    syncServiceRef.current.stop()
    setStatus('idle')
  }, [])

  const syncPending = useCallback(async () => {
    try {
      await syncPendingRecipes()
      // Refresh sync state
      const state = await syncServiceRef.current.getSyncState()
      setSyncState(state)
      setStatus(state.status)
    } catch (error) {
      console.error('Failed to sync pending items:', error)
      throw error
    }
  }, [])

  const value: SyncContextValue = {
    status,
    syncState,
    startSync,
    stopSync,
    syncPending,
    isOnline,
  }

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/**
 * Hook to access sync context
 */
export function useSync(): SyncContextValue {
  const context = useContext(SyncContext)
  if (!context) {
    throw new Error('useSync must be used within SyncProvider')
  }
  return context
}
