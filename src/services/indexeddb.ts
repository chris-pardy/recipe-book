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
    }
    indexes: {
      'by-title': string
      'by-createdAt': string
      'by-updatedAt': string
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
}

const DB_NAME = 'recipe-book'
const DB_VERSION = 1

/**
 * Initialize the IndexedDB database
 */
export async function initDB(): Promise<IDBPDatabase<RecipeBookDB>> {
  return openDB<RecipeBookDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Recipes store
      if (!db.objectStoreNames.contains('recipes')) {
        const recipeStore = db.createObjectStore('recipes', { keyPath: 'uri' })
        recipeStore.createIndex('by-title', 'title')
        recipeStore.createIndex('by-createdAt', 'createdAt')
        recipeStore.createIndex('by-updatedAt', 'updatedAt')
      }

      // Collections store
      if (!db.objectStoreNames.contains('collections')) {
        const collectionStore = db.createObjectStore('collections', {
          keyPath: 'uri',
        })
        collectionStore.createIndex('by-name', 'name')
        collectionStore.createIndex('by-createdAt', 'createdAt')
      }

      // Sync state store
      if (!db.objectStoreNames.contains('syncState')) {
        db.createObjectStore('syncState')
      }
    },
  })
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
 * Recipe operations
 */
export const recipeDB = {
  async get(uri: string): Promise<(Recipe & { uri: string }) | undefined> {
    const db = await getDB()
    return db.get('recipes', uri)
  },

  async getAll(): Promise<(Recipe & { uri: string })[]> {
    const db = await getDB()
    return db.getAll('recipes')
  },

  async put(
    uri: string,
    recipe: Recipe,
    cid?: string,
  ): Promise<void> {
    const db = await getDB()
    await db.put('recipes', {
      ...recipe,
      uri,
      cid,
      indexedAt: new Date().toISOString(),
    })
  },

  async delete(uri: string): Promise<void> {
    const db = await getDB()
    await db.delete('recipes', uri)
  },

  async searchByTitle(query: string): Promise<(Recipe & { uri: string })[]> {
    const db = await getDB()
    const allRecipes = await db.getAll('recipes')
    const lowerQuery = query.toLowerCase()
    return allRecipes.filter((recipe) =>
      recipe.title.toLowerCase().includes(lowerQuery),
    )
  },
}

/**
 * Collection operations
 */
export const collectionDB = {
  async get(uri: string): Promise<(Collection & { uri: string }) | undefined> {
    const db = await getDB()
    return db.get('collections', uri)
  },

  async getAll(): Promise<(Collection & { uri: string })[]> {
    const db = await getDB()
    return db.getAll('collections')
  },

  async put(
    uri: string,
    collection: Collection,
    cid?: string,
  ): Promise<void> {
    const db = await getDB()
    await db.put('collections', {
      ...collection,
      uri,
      cid,
      indexedAt: new Date().toISOString(),
    })
  },

  async delete(uri: string): Promise<void> {
    const db = await getDB()
    await db.delete('collections', uri)
  },
}

/**
 * Sync state operations
 */
export const syncStateDB = {
  async getLastSync(): Promise<string | null> {
    const db = await getDB()
    const state = await db.get('syncState', 'lastSync')
    return state?.lastSyncAt || null
  },

  async setLastSync(cursor?: string): Promise<void> {
    const db = await getDB()
    await db.put('syncState', 'lastSync', {
      lastSyncAt: new Date().toISOString(),
      lastCursor: cursor,
    })
  },
}
