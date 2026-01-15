/**
 * ATProto Firehose Sync Service
 * Handles background synchronization of recipes and collections via ATProto Firehose
 */

import { BskyAgent } from '@atproto/api'
import { getAuthenticatedAgent } from './agent'
import { RECIPE_COLLECTION, COLLECTION_COLLECTION } from './atproto'
import { recipeDB, collectionDB, syncStateDB } from './indexeddb'
import type { Recipe, RecipeRecord } from '../types/recipe'
import type { Collection, CollectionRecord } from '../types/collection'

/**
 * Sync status types
 */
export type SyncStatus = 'idle' | 'connecting' | 'connected' | 'syncing' | 'error' | 'paused'

/**
 * Sync state interface
 */
export interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error: string | null
  pendingSyncCount: number
}

/**
 * Event callbacks for sync events
 */
export interface SyncCallbacks {
  onStatusChange?: (status: SyncStatus) => void
  onRecipeUpdated?: (uri: string, recipe: Recipe) => void
  onRecipeDeleted?: (uri: string) => void
  onCollectionUpdated?: (uri: string, collection: Collection) => void
  onCollectionDeleted?: (uri: string) => void
  onError?: (error: Error) => void
}

/**
 * Firehose sync service class
 */
export class FirehoseSyncService {
  private agent: BskyAgent | null = null
  private abortController: AbortController | null = null
  private currentSignal: AbortSignal | null = null
  private status: SyncStatus = 'idle'
  private callbacks: SyncCallbacks = {}
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isPaused = false
  private userDid: string | null = null

  /**
   * Initialize the sync service
   */
  async initialize(callbacks: SyncCallbacks = {}): Promise<void> {
    this.callbacks = callbacks
    this.status = 'idle'
  }

  /**
   * Start syncing
   */
  async start(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return
    }

    try {
      this.setStatus('connecting')
      
      const agent = await getAuthenticatedAgent()
      if (!agent || !agent.session) {
        throw new Error('Not authenticated')
      }

      this.agent = agent
      this.userDid = agent.session.did
      this.isPaused = false
      this.reconnectAttempts = 0

      await this.connect()
    } catch (error) {
      this.setStatus('error')
      const errorMessage = error instanceof Error ? error.message : 'Failed to start sync'
      this.callbacks.onError?.(new Error(errorMessage))
      throw error
    }
  }

  /**
   * Stop syncing
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.currentSignal = null
    this.agent = null
    this.userDid = null
    this.setStatus('idle')
  }

  /**
   * Pause syncing (e.g., when tab is inactive)
   */
  pause(): void {
    if (this.isPaused) {
      return
    }
    this.isPaused = true
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.currentSignal = null
    if (this.status === 'connected' || this.status === 'syncing') {
      this.setStatus('paused')
    }
  }

  /**
   * Resume syncing (e.g., when tab becomes active)
   */
  async resume(): Promise<void> {
    if (!this.isPaused) {
      return
    }
    this.isPaused = false
    if (this.agent && this.userDid) {
      await this.connect()
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status
  }

  /**
   * Get current sync state
   */
  async getSyncState(): Promise<SyncState> {
    const lastSyncAt = await syncStateDB.getLastSync()
    const pendingRecipes = await recipeDB.getPendingSync()
    
    return {
      status: this.status,
      lastSyncAt,
      error: this.status === 'error' ? 'Sync error occurred' : null,
      pendingSyncCount: pendingRecipes.length,
    }
  }

  /**
   * Connect to Firehose
   */
  private async connect(): Promise<void> {
    if (!this.agent || !this.userDid) {
      throw new Error('Agent not initialized')
    }

    if (this.isPaused) {
      return
    }

    this.abortController = new AbortController()
    const signal = this.abortController.signal
    this.currentSignal = signal

    try {
      this.setStatus('connected')

      // Subscribe to repository events for the user's DID
      const subscription = this.agent.com.atproto.sync.subscribeRepos(
        {
          cursor: await this.getLastCursor(),
        },
        {
          signal,
        },
      )

      // Process events from the subscription
      for await (const event of subscription) {
        if (signal.aborted || this.isPaused) {
          break
        }

        await this.handleEvent(event)
      }
    } catch (error) {
      if (signal.aborted || this.isPaused) {
        // Expected abort, don't treat as error
        return
      }

      // Handle reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
        await this.sleep(delay)
        await this.connect()
      } else {
        this.setStatus('error')
        const errorMessage = error instanceof Error ? error.message : 'Connection failed'
        this.callbacks.onError?.(new Error(errorMessage))
      }
    }
  }

  /**
   * Handle a Firehose event
   */
  private async handleEvent(event: unknown): Promise<void> {
    try {
      // Type guard for commit events
      // ATProto Firehose events can be different types, we only care about commits
      if (
        event &&
        typeof event === 'object' &&
        '$type' in event &&
        (event as { $type: string }).$type === 'com.atproto.sync.subscribeRepos#commit'
      ) {
        const commitEvent = event as {
          repo?: string
          ops?: Array<{
            action: string
            path: string
            cid?: string
          }>
          time?: string
          commit?: {
            cid?: string
          }
        }

        // Only process events for the authenticated user's repository
        if (commitEvent.repo !== this.userDid) {
          return
        }

        if (!commitEvent.ops || !Array.isArray(commitEvent.ops)) {
          return
        }

        this.setStatus('syncing')

        for (const op of commitEvent.ops) {
          if (this.currentSignal?.aborted || this.isPaused) {
            break
          }

          await this.handleOperation(op, commitEvent.time)
        }

        // Update last sync timestamp
        if (commitEvent.time) {
          await syncStateDB.setLastSync()
        }

        this.setStatus('connected')
      }
    } catch (error) {
      console.error('Error handling Firehose event:', error)
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error('Unknown error handling event'),
      )
    }
  }

  /**
   * Handle a repository operation
   */
  private async handleOperation(
    op: { action: string; path: string; cid?: string },
    timestamp?: string,
  ): Promise<void> {
    const { action, path } = op

    // Parse path: collection/rkey
    const pathParts = path.split('/')
    if (pathParts.length !== 2) {
      return
    }

    const [collection, rkey] = pathParts

    // Handle recipe operations
    if (collection === RECIPE_COLLECTION) {
      await this.handleRecipeOperation(action, rkey, op.cid)
      return
    }

    // Handle collection operations
    if (collection === COLLECTION_COLLECTION) {
      await this.handleCollectionOperation(action, rkey, op.cid)
      return
    }
  }

  /**
   * Handle a recipe operation
   */
  private async handleRecipeOperation(
    action: string,
    rkey: string,
    cid?: string,
  ): Promise<void> {
    if (!this.agent || !this.userDid) {
      return
    }

    const uri = `at://${this.userDid}/${RECIPE_COLLECTION}/${rkey}`

    try {
      if (action === 'create' || action === 'update') {
        // Fetch the recipe from PDS
        const recipeRecord = await this.agent.com.atproto.repo.getRecord({
          repo: this.userDid,
          collection: RECIPE_COLLECTION,
          rkey,
        })

        const recipe = recipeRecord.value as RecipeRecord

        // Check if we have a pending sync for this recipe
        const existing = await recipeDB.get(uri)
        const hasPendingSync = existing?.pendingSync === true

        // If we have pending sync, check for conflicts
        if (hasPendingSync && existing) {
          // Last-write-wins: compare timestamps
          const remoteUpdatedAt = new Date(recipe.updatedAt).getTime()
          const localUpdatedAt = new Date(existing.updatedAt).getTime()

          if (remoteUpdatedAt > localUpdatedAt) {
            // Remote is newer, use remote version
            await recipeDB.put(uri, recipe, cid, false)
            this.callbacks.onRecipeUpdated?.(uri, recipe)
          } else {
            // Local is newer or same, keep pending sync flag
            // The pending sync will be processed later
            return
          }
        } else {
          // No conflict, update cache
          await recipeDB.put(uri, recipe, cid, false)
          this.callbacks.onRecipeUpdated?.(uri, recipe)
        }
      } else if (action === 'delete') {
        // Remove from cache
        await recipeDB.delete(uri)
        this.callbacks.onRecipeDeleted?.(uri)
      }
    } catch (error) {
      console.error(`Error handling recipe operation ${action} for ${uri}:`, error)
      // Don't throw - continue processing other events
    }
  }

  /**
   * Handle a collection operation
   */
  private async handleCollectionOperation(
    action: string,
    rkey: string,
    cid?: string,
  ): Promise<void> {
    if (!this.agent || !this.userDid) {
      return
    }

    const uri = `at://${this.userDid}/${COLLECTION_COLLECTION}/${rkey}`

    try {
      if (action === 'create' || action === 'update') {
        // Fetch the collection from PDS
        const collectionRecord = await this.agent.com.atproto.repo.getRecord({
          repo: this.userDid,
          collection: COLLECTION_COLLECTION,
          rkey,
        })

        const collection = collectionRecord.value as CollectionRecord

        // Update cache
        await collectionDB.put(uri, collection, cid)
        this.callbacks.onCollectionUpdated?.(uri, collection)
      } else if (action === 'delete') {
        // Remove from cache
        await collectionDB.delete(uri)
        this.callbacks.onCollectionDeleted?.(uri)
      }
    } catch (error) {
      console.error(`Error handling collection operation ${action} for ${uri}:`, error)
      // Don't throw - continue processing other events
    }
  }

  /**
   * Get last cursor from sync state
   */
  private async getLastCursor(): Promise<string | undefined> {
    try {
      const db = await import('./indexeddb').then(m => m.getDB())
      const state = await db.get('syncState', 'lastSync')
      return state?.lastCursor
    } catch {
      return undefined
    }
  }

  /**
   * Set sync status and notify callbacks
   */
  private setStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status
      this.callbacks.onStatusChange?.(status)
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Singleton instance
 */
let syncServiceInstance: FirehoseSyncService | null = null

/**
 * Get the Firehose sync service instance
 */
export function getFirehoseSyncService(): FirehoseSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new FirehoseSyncService()
  }
  return syncServiceInstance
}
