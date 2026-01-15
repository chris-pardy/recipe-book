/**
 * Sync Status Indicator Component
 * Displays the current sync status and pending sync count
 */

import { useSync } from '../hooks/useSync'
import { Wifi, WifiOff, Loader2, CheckCircle2, AlertCircle, Pause } from 'lucide-react'

export function SyncStatusIndicator() {
  const { status, syncState, isOnline } = useSync()

  if (!syncState) {
    return null
  }

  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiOff className="h-4 w-4 text-gray-500" />
    }

    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'connecting':
      case 'syncing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />
      default:
        return <Wifi className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline'
    }

    switch (status) {
      case 'connected':
        return 'Synced'
      case 'connecting':
        return 'Connecting...'
      case 'syncing':
        return 'Syncing...'
      case 'error':
        return 'Sync Error'
      case 'paused':
        return 'Paused'
      default:
        return 'Idle'
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600">
      {getStatusIcon()}
      <span>{getStatusText()}</span>
      {syncState.pendingSyncCount > 0 && (
        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">
          {syncState.pendingSyncCount} pending
        </span>
      )}
    </div>
  )
}
