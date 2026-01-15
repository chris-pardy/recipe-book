/**
 * IndexedDB service for local caching of recipes and collections
 * Uses the 'idb' library for a Promise-based API
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { Recipe, Collection } from '../types'

export interface RecipeBookDB extends DBSchema {
  recipes: {
    key: string // recipe URI
    value: Recipe & {
      uri: string
      cid?: string
      indexedAt: string
      pendingSync?: boolean
      lastModified?: string
    }
    indexes: {
      'by-title': string
      'by-createdAt': string
      'by-updatedAt': string
      'by-pendingSync': boolean
    }
  }
  collections: {
    key: string // collection URI
    value: Collection & {
      uri: string
      cid?: string
      indexedAt: string
    }
    indexes: {
      'by-name': string
      'by-createdAt': string
    }
  }
  syncState: {
    key: string
    value: {
      lastSyncAt: string
      lastCursor?: string
    }
  }
  pendingSyncQueue: {
    key: string // recipe URI
    value: {
      uri: string
      operation: 'create' | 'update' | 'delete'
      timestamp: string
      data?: Recipe
    }
    indexes: {
      'by-timestamp': string
    }
  }
}

const DB_NAME = 'recipe-book'
const DB_VERSION = 2

/**
 * Custom error class for IndexedDB operations
 */
export class IndexedDBError extends Error {
  constructor(
    message: string,
    public operation: string,
    public originalError?: unknown,
  ) {
    super(message)
    this.name = 'IndexedDBError'
  }
}

/**
 * Initialize the IndexedDB database with migration support
 */
export async function initDB(): Promise<IDBPDatabase<RecipeBookDB>> {
  try {
    return await openDB<RecipeBookDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, newVersion) {
        // Initial schema creation (version 1)
        if (oldVersion === 0) {
          // Recipes store
          const recipeStore = db.createObjectStore('recipes', { keyPath: 'uri' })
          recipeStore.createIndex('by-title', 'title')
          recipeStore.createIndex('by-createdAt', 'createdAt')
          recipeStore.createIndex('by-updatedAt', 'updatedAt')
          recipeStore.createIndex('by-pendingSync', 'pendingSync')

          // Collections store
          const collectionStore = db.createObjectStore('collections', {
            keyPath: 'uri',
          })
          collectionStore.createIndex('by-name', 'name')
          collectionStore.createIndex('by-createdAt', 'createdAt')

          // Sync state store
          db.createObjectStore('syncState')

          // Pending sync queue store
          const queueStore = db.createObjectStore('pendingSyncQueue', {
            keyPath: 'uri',
          })
          queueStore.createIndex('by-timestamp', 'timestamp')
        }

        // Migration from version 1 to 2
        if (oldVersion < 2 && oldVersion > 0) {
          // Add pendingSync index to recipes if it doesn't exist
          if (db.objectStoreNames.contains('recipes')) {
            const tx = db.transaction('recipes', 'readwrite')
            const recipeStore = tx.store
            try {
              if (!recipeStore.indexNames.contains('by-pendingSync')) {
                recipeStore.createIndex('by-pendingSync', 'pendingSync')
              }
            } catch (e) {
              // Index might already exist, ignore
            }
            await tx.done
          }

          // Create pending sync queue store
          if (!db.objectStoreNames.contains('pendingSyncQueue')) {
            const queueStore = db.createObjectStore('pendingSyncQueue', {
              keyPath: 'uri',
            })
            queueStore.createIndex('by-timestamp', 'timestamp')
          }
        }
      },
    })
  } catch (error) {
    throw new IndexedDBError(
      `Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'initDB',
      error,
    )
  }
}

/**
 * Get the database instance (initializes if needed)
 */
let dbPromise: Promise<IDBPDatabase<RecipeBookDB>> | null = null

export function getDB(): Promise<IDBPDatabase<RecipeBookDB>> {
  if (!dbPromise) {
    dbPromise = initDB()
  }
  return dbPromise
}

/**
 * Reset the database promise (useful for testing)
 */
export function resetDB(): void {
  dbPromise = null
}

/**
 * Recipe operations with error handling
 */
export const recipeDB = {
  async get(uri: string): Promise<(Recipe & { uri: string }) | undefined> {
    try {
      const db = await getDB()
      return await db.get('recipes', uri)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get recipe: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.get',
        error,
      )
    }
  },

  async getAll(): Promise<(Recipe & { uri: string })[]> {
    try {
      const db = await getDB()
      return await db.getAll('recipes')
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get all recipes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.getAll',
        error,
      )
    }
  },

  async put(
    uri: string,
    recipe: Recipe,
    cid?: string,
    pendingSync = false,
  ): Promise<void> {
    try {
      const db = await getDB()
      const now = new Date().toISOString()
      await db.put('recipes', {
        ...recipe,
        uri,
        cid,
        indexedAt: now,
        pendingSync,
        lastModified: now,
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to put recipe: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.put',
        error,
      )
    }
  },

  async update(
    uri: string,
    updates: Partial<Recipe>,
    pendingSync = false,
  ): Promise<void> {
    try {
      const db = await getDB()
      const existing = await db.get('recipes', uri)
      if (!existing) {
        throw new Error(`Recipe with URI ${uri} not found`)
      }
      const now = new Date().toISOString()
      await db.put('recipes', {
        ...existing,
        ...updates,
        uri,
        pendingSync,
        lastModified: now,
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to update recipe: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.update',
        error,
      )
    }
  },

  async delete(uri: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete('recipes', uri)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to delete recipe: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.delete',
        error,
      )
    }
  },

  async searchByTitle(query: string): Promise<(Recipe & { uri: string })[]> {
    try {
      const db = await getDB()
      const allRecipes = await db.getAll('recipes')
      const lowerQuery = query.toLowerCase()
      return allRecipes.filter((recipe) =>
        recipe.title.toLowerCase().includes(lowerQuery),
      )
    } catch (error) {
      throw new IndexedDBError(
        `Failed to search recipes by title: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.searchByTitle',
        error,
      )
    }
  },

  async getByCollection(
    collectionUri: string,
  ): Promise<(Recipe & { uri: string })[]> {
    try {
      const db = await getDB()
      const collection = await db.get('collections', collectionUri)
      if (!collection) {
        return []
      }
      const allRecipes = await db.getAll('recipes')
      return allRecipes.filter((recipe) =>
        collection.recipeUris.includes(recipe.uri),
      )
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get recipes by collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.getByCollection',
        error,
      )
    }
  },

  async markPendingSync(uri: string, pending = true): Promise<void> {
    try {
      const db = await getDB()
      const recipe = await db.get('recipes', uri)
      if (!recipe) {
        throw new Error(`Recipe with URI ${uri} not found`)
      }
      await db.put('recipes', {
        ...recipe,
        pendingSync: pending,
        lastModified: new Date().toISOString(),
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to mark recipe as pending sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.markPendingSync',
        error,
      )
    }
  },

  async getPendingSync(): Promise<(Recipe & { uri: string })[]> {
    try {
      const db = await getDB()
      const allRecipes = await db.getAll('recipes')
      return allRecipes.filter((recipe) => recipe.pendingSync === true)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get pending sync recipes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'recipeDB.getPendingSync',
        error,
      )
    }
  },
}

/**
 * Collection operations with error handling
 */
export const collectionDB = {
  async get(uri: string): Promise<(Collection & { uri: string }) | undefined> {
    try {
      const db = await getDB()
      return await db.get('collections', uri)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'collectionDB.get',
        error,
      )
    }
  },

  async getAll(): Promise<(Collection & { uri: string })[]> {
    try {
      const db = await getDB()
      return await db.getAll('collections')
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get all collections: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'collectionDB.getAll',
        error,
      )
    }
  },

  async put(
    uri: string,
    collection: Collection,
    cid?: string,
  ): Promise<void> {
    try {
      const db = await getDB()
      await db.put('collections', {
        ...collection,
        uri,
        cid,
        indexedAt: new Date().toISOString(),
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to put collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'collectionDB.put',
        error,
      )
    }
  },

  async delete(uri: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete('collections', uri)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to delete collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'collectionDB.delete',
        error,
      )
    }
  },
}

/**
 * Sync state operations with error handling
 */
export const syncStateDB = {
  async getLastSync(): Promise<string | null> {
    try {
      const db = await getDB()
      const state = await db.get('syncState', 'lastSync')
      return state?.lastSyncAt || null
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get last sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'syncStateDB.getLastSync',
        error,
      )
    }
  },

  async setLastSync(cursor?: string): Promise<void> {
    try {
      const db = await getDB()
      await db.put('syncState', 'lastSync', {
        lastSyncAt: new Date().toISOString(),
        lastCursor: cursor,
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to set last sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'syncStateDB.setLastSync',
        error,
      )
    }
  },
}

/**
 * Pending sync queue operations with error handling
 */
export const pendingSyncQueue = {
  async add(
    uri: string,
    operation: 'create' | 'update' | 'delete',
    data?: Recipe,
  ): Promise<void> {
    try {
      const db = await getDB()
      await db.put('pendingSyncQueue', {
        uri,
        operation,
        timestamp: new Date().toISOString(),
        data,
      })
    } catch (error) {
      throw new IndexedDBError(
        `Failed to add to pending sync queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'pendingSyncQueue.add',
        error,
      )
    }
  },

  async getAll(): Promise<
    Array<{
      uri: string
      operation: 'create' | 'update' | 'delete'
      timestamp: string
      data?: Recipe
    }>
  > {
    try {
      const db = await getDB()
      return await db.getAll('pendingSyncQueue')
    } catch (error) {
      throw new IndexedDBError(
        `Failed to get pending sync queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'pendingSyncQueue.getAll',
        error,
      )
    }
  },

  async remove(uri: string): Promise<void> {
    try {
      const db = await getDB()
      await db.delete('pendingSyncQueue', uri)
    } catch (error) {
      throw new IndexedDBError(
        `Failed to remove from pending sync queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'pendingSyncQueue.remove',
        error,
      )
    }
  },

  async clear(): Promise<void> {
    try {
      const db = await getDB()
      const tx = db.transaction('pendingSyncQueue', 'readwrite')
      const store = tx.objectStore('pendingSyncQueue')
      await store.clear()
      await tx.done
    } catch (error) {
      throw new IndexedDBError(
        `Failed to clear pending sync queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'pendingSyncQueue.clear',
        error,
      )
    }
  },
}
