/**
 * Pending Sync Service
 * Handles syncing of pending local changes to PDS when connection is restored
 */

import { BskyAgent } from '@atproto/api'
import { getAuthenticatedAgent } from './agent'
import { createRecipe, updateRecipe, deleteRecipe } from './atproto'
import { recipeDB, pendingSyncQueue } from './indexeddb'
import type { Recipe } from '../types/recipe'

/**
 * Error class for pending sync operations
 */
export class PendingSyncError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'PendingSyncError'
  }
}

/**
 * Sync a single pending recipe operation
 */
async function syncPendingRecipe(
  agent: BskyAgent,
  uri: string,
  operation: 'create' | 'update' | 'delete',
  data?: Recipe,
): Promise<void> {
  try {
    if (operation === 'create' && data) {
      // Create recipe in PDS
      const result = await createRecipe(agent, data)
      // Update IndexedDB with the new URI and clear pending sync
      await recipeDB.put(result.uri, data, result.cid, false)
      // Remove from pending queue
      await pendingSyncQueue.remove(uri)
    } else if (operation === 'update' && data) {
      // Update recipe in PDS
      const result = await updateRecipe(agent, uri, data)
      // Update IndexedDB and clear pending sync
      await recipeDB.put(uri, data, result.cid, false)
      // Remove from pending queue
      await pendingSyncQueue.remove(uri)
    } else if (operation === 'delete') {
      // Delete recipe from PDS
      await deleteRecipe(agent, uri)
      // Remove from IndexedDB
      await recipeDB.delete(uri)
      // Remove from pending queue
      await pendingSyncQueue.remove(uri)
    }
  } catch (error) {
    // If it's a network error, keep it in the queue for retry
    // Otherwise, log and remove from queue
    if (error instanceof Error) {
      const isNetworkError =
        error.message.includes('network') ||
        error.message.includes('fetch') ||
        error.message.includes('timeout')
      
      if (!isNetworkError) {
        // Non-network error - remove from queue
        console.error(`Failed to sync ${operation} for ${uri}:`, error)
        await pendingSyncQueue.remove(uri)
        throw new PendingSyncError(
          `Failed to sync ${operation}: ${error.message}`,
          'SYNC_ERROR',
        )
      }
    }
    // Network error - keep in queue for retry
    throw error
  }
}

/**
 * Sync all pending recipe operations
 * @returns Number of successfully synced items
 */
export async function syncPendingRecipes(): Promise<number> {
  const agent = await getAuthenticatedAgent()
  if (!agent) {
    throw new PendingSyncError('Not authenticated', 'AUTH_ERROR')
  }

  const pending = await pendingSyncQueue.getAll()
  if (pending.length === 0) {
    return 0
  }

  let syncedCount = 0
  const errors: Error[] = []

  // Sort by timestamp to process in order
  const sorted = pending.sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )

  for (const item of sorted) {
    try {
      await syncPendingRecipe(agent, item.uri, item.operation, item.data)
      syncedCount++
    } catch (error) {
      // Log error but continue with other items
      errors.push(
        error instanceof Error
          ? error
          : new Error('Unknown error syncing pending recipe'),
      )
    }
  }

  if (errors.length > 0 && syncedCount === 0) {
    // All failed
    throw new PendingSyncError(
      `Failed to sync pending recipes: ${errors[0].message}`,
      'SYNC_ERROR',
    )
  }

  return syncedCount
}

/**
 * Mark a recipe as pending sync and add to queue
 */
export async function markRecipePendingSync(
  uri: string,
  operation: 'create' | 'update' | 'delete',
  data?: Recipe,
): Promise<void> {
  // Mark recipe as pending sync
  if (operation !== 'delete') {
    await recipeDB.markPendingSync(uri, true)
  }

  // Add to pending sync queue
  await pendingSyncQueue.add(uri, operation, data)
}

/**
 * Clear pending sync flag for a recipe
 */
export async function clearPendingSync(uri: string): Promise<void> {
  await recipeDB.markPendingSync(uri, false)
  await pendingSyncQueue.remove(uri)
}
