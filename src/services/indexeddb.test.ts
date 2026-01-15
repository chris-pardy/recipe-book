import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  initDB,
  getDB,
  recipeDB,
  collectionDB,
  syncStateDB,
  pendingSyncQueue,
  resetDB,
  IndexedDBError,
} from './indexeddb'
import type { Recipe, Collection } from '../types'

// Mock idb library
vi.mock('idb', async () => {
  const createMockDB = () => ({
    get: vi.fn(),
    getAll: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    objectStoreNames: {
      contains: vi.fn().mockReturnValue(false),
    },
    createObjectStore: vi.fn().mockReturnValue({
      createIndex: vi.fn(),
    }),
  })

  return {
    openDB: vi.fn().mockResolvedValue(createMockDB()),
  }
})

describe('IndexedDB Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDB()
  })

  describe('initDB', () => {
    it('should initialize database with correct structure', async () => {
      const mockDB = {
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
        transaction: vi.fn().mockReturnValue({
          store: {
            indexNames: {
              contains: vi.fn().mockReturnValue(false),
            },
            createIndex: vi.fn(),
          },
          done: Promise.resolve(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await initDB()

      expect(openDB).toHaveBeenCalledWith('recipe-book', 2, expect.any(Object))
    })

    it('should handle migration from version 1 to 2', async () => {
      const mockStore = {
        indexNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createIndex: vi.fn(),
      }

      const mockDB = {
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(true),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
        transaction: vi.fn().mockReturnValue({
          store: mockStore,
          done: Promise.resolve(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockImplementation((name: any, version: any, options: any) => {
        if (options?.upgrade) {
          options.upgrade(mockDB as any, 1, 2)
        }
        return Promise.resolve(mockDB as any)
      })

      await initDB()

      expect(mockDB.objectStoreNames.contains).toHaveBeenCalledWith('recipes')
    })

    it('should throw IndexedDBError on initialization failure', async () => {
      const { openDB } = await import('idb')
      ;(openDB as any).mockRejectedValue(new Error('Database error'))

      await expect(initDB()).rejects.toThrow(IndexedDBError)
      await expect(initDB()).rejects.toThrow('Failed to initialize database')
    })
  })

  describe('recipeDB', () => {
    it('should get a recipe by URI', async () => {
      const mockRecipe: Recipe & { uri: string } = {
        uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn().mockResolvedValue(mockRecipe),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const result = await recipeDB.get('at://did:plc:123/dev.chrispardy.recipes/1')

      expect(result).toEqual(mockRecipe)
    })

    it('should put a recipe', async () => {
      resetDB() // Reset to ensure fresh mock
      const recipe: Recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await recipeDB.put('at://did:plc:123/dev.chrispardy.recipes/1', recipe, 'cid123')

      expect(mockDB.put).toHaveBeenCalledWith(
        'recipes',
        expect.objectContaining({
          ...recipe,
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          cid: 'cid123',
          indexedAt: expect.any(String),
          pendingSync: false,
          lastModified: expect.any(String),
        }),
      )
    })

    it('should delete a recipe', async () => {
      resetDB() // Reset to ensure fresh mock
      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await recipeDB.delete('at://did:plc:123/dev.chrispardy.recipes/1')

      expect(mockDB.delete).toHaveBeenCalledWith('recipes', 'at://did:plc:123/dev.chrispardy.recipes/1')
    })

    it('should search recipes by title', async () => {
      resetDB() // Reset to ensure fresh mock
      const mockRecipes: (Recipe & { uri: string })[] = [
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          title: 'Chocolate Cake',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/2',
          title: 'Vanilla Cake',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue(mockRecipes),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const results = await recipeDB.searchByTitle('chocolate')

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })

    it('should update a recipe', async () => {
      resetDB()
      const existingRecipe: Recipe & { uri: string; indexedAt: string } = {
        uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        indexedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn().mockResolvedValue(existingRecipe),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await recipeDB.update('at://did:plc:123/dev.chrispardy.recipes/1', {
        title: 'Updated Recipe',
      })

      expect(mockDB.put).toHaveBeenCalledWith(
        'recipes',
        expect.objectContaining({
          ...existingRecipe,
          title: 'Updated Recipe',
          pendingSync: false,
          lastModified: expect.any(String),
        }),
      )
    })

    it('should throw error when updating non-existent recipe', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(
        recipeDB.update('at://did:plc:123/dev.chrispardy.recipes/1', {
          title: 'Updated',
        }),
      ).rejects.toThrow(IndexedDBError)
    })

    it('should get recipes by collection', async () => {
      resetDB()
      const collectionUri = 'at://did:plc:123/dev.chrispardy.collections/1'
      const mockCollection: Collection & { uri: string } = {
        uri: collectionUri,
        name: 'My Recipes',
        recipeUris: [
          'at://did:plc:123/dev.chrispardy.recipes/1',
          'at://did:plc:123/dev.chrispardy.recipes/2',
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockRecipes: (Recipe & { uri: string })[] = [
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          title: 'Recipe 1',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/2',
          title: 'Recipe 2',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/3',
          title: 'Recipe 3',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]

      const mockDB = {
        get: vi.fn().mockImplementation((store: string, key: string) => {
          if (store === 'collections' && key === collectionUri) {
            return Promise.resolve(mockCollection)
          }
          return Promise.resolve(undefined)
        }),
        getAll: vi.fn().mockResolvedValue(mockRecipes),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const results = await recipeDB.getByCollection(collectionUri)

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.uri)).toEqual([
        'at://did:plc:123/dev.chrispardy.recipes/1',
        'at://did:plc:123/dev.chrispardy.recipes/2',
      ])
    })

    it('should return empty array when collection does not exist', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const results = await recipeDB.getByCollection(
        'at://did:plc:123/dev.chrispardy.collections/999',
      )

      expect(results).toEqual([])
    })

    it('should mark recipe as pending sync', async () => {
      resetDB()
      const existingRecipe: Recipe & { uri: string; indexedAt: string } = {
        uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        indexedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn().mockResolvedValue(existingRecipe),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await recipeDB.markPendingSync('at://did:plc:123/dev.chrispardy.recipes/1', true)

      expect(mockDB.put).toHaveBeenCalledWith(
        'recipes',
        expect.objectContaining({
          ...existingRecipe,
          pendingSync: true,
          lastModified: expect.any(String),
        }),
      )
    })

    it('should throw error when marking non-existent recipe as pending sync', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(
        recipeDB.markPendingSync('at://did:plc:123/dev.chrispardy.recipes/1', true),
      ).rejects.toThrow(IndexedDBError)
    })

    it('should get pending sync recipes', async () => {
      resetDB()
      const mockRecipes: (Recipe & { uri: string; pendingSync?: boolean })[] = [
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          title: 'Recipe 1',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          pendingSync: true,
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/2',
          title: 'Recipe 2',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          pendingSync: false,
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/3',
          title: 'Recipe 3',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          pendingSync: true,
        },
      ]

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue(mockRecipes),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const results = await recipeDB.getPendingSync()

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.pendingSync === true)).toBe(true)
    })

    it('should handle errors in recipe operations', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockRejectedValue(new Error('Database error')),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(recipeDB.get('test-uri')).rejects.toThrow(IndexedDBError)
    })
  })

  describe('collectionDB', () => {
    it('should get a collection by URI', async () => {
      resetDB() // Reset to ensure fresh mock
      const mockCollection: Collection & { uri: string } = {
        uri: 'at://did:plc:123/dev.chrispardy.collections/1',
        name: 'My Recipes',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn().mockImplementation((store: string, key: string) => {
          if (store === 'collections' && key === 'at://did:plc:123/dev.chrispardy.collections/1') {
            return Promise.resolve(mockCollection)
          }
          return Promise.resolve(undefined)
        }),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const result = await collectionDB.get('at://did:plc:123/dev.chrispardy.collections/1')

      expect(result).toEqual(mockCollection)
    })

    it('should put a collection', async () => {
      resetDB() // Reset to ensure fresh mock
      const collection: Collection = {
        name: 'My Recipes',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await collectionDB.put('at://did:plc:123/dev.chrispardy.collections/1', collection, 'cid123')

      expect(mockDB.put).toHaveBeenCalledWith(
        'collections',
        expect.objectContaining({
          ...collection,
          uri: 'at://did:plc:123/dev.chrispardy.collections/1',
          cid: 'cid123',
          indexedAt: expect.any(String),
        }),
      )
    })

    it('should handle errors in collection operations', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockRejectedValue(new Error('Database error')),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(collectionDB.get('test-uri')).rejects.toThrow(IndexedDBError)
    })
  })

  describe('syncStateDB', () => {
    it('should get last sync timestamp', async () => {
      resetDB() // Reset to ensure fresh mock
      const mockState = {
        lastSyncAt: '2024-01-01T00:00:00Z',
        lastCursor: 'cursor123',
      }

      const mockDB = {
        get: vi.fn().mockImplementation((store: string, key: string) => {
          if (store === 'syncState' && key === 'lastSync') {
            return Promise.resolve(mockState)
          }
          return Promise.resolve(undefined)
        }),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const result = await syncStateDB.getLastSync()

      expect(result).toBe('2024-01-01T00:00:00Z')
    })

    it('should return null if no sync state exists', async () => {
      const mockDB = {
        get: vi.fn().mockResolvedValue(undefined),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const result = await syncStateDB.getLastSync()

      expect(result).toBeNull()
    })

    it('should set last sync timestamp', async () => {
      resetDB() // Reset to ensure fresh mock
      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await syncStateDB.setLastSync('cursor123')

      expect(mockDB.put).toHaveBeenCalledWith(
        'syncState',
        'lastSync',
        expect.objectContaining({
          lastSyncAt: expect.any(String),
          lastCursor: 'cursor123',
        }),
      )
    })

    it('should handle errors in sync state operations', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn().mockRejectedValue(new Error('Database error')),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(syncStateDB.getLastSync()).rejects.toThrow(IndexedDBError)
    })
  })

  describe('pendingSyncQueue', () => {
    it('should add item to pending sync queue', async () => {
      resetDB()
      const recipe: Recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await pendingSyncQueue.add(
        'at://did:plc:123/dev.chrispardy.recipes/1',
        'create',
        recipe,
      )

      expect(mockDB.put).toHaveBeenCalledWith(
        'pendingSyncQueue',
        expect.objectContaining({
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          operation: 'create',
          timestamp: expect.any(String),
          data: recipe,
        }),
      )
    })

    it('should get all items from pending sync queue', async () => {
      resetDB()
      const mockQueueItems = [
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          operation: 'create' as const,
          timestamp: '2024-01-01T00:00:00Z',
          data: {
            title: 'Recipe 1',
            servings: 4,
            ingredients: [],
            steps: [],
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        },
        {
          uri: 'at://did:plc:123/dev.chrispardy.recipes/2',
          operation: 'update' as const,
          timestamp: '2024-01-01T01:00:00Z',
        },
      ]

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue(mockQueueItems),
        put: vi.fn(),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      const results = await pendingSyncQueue.getAll()

      expect(results).toEqual(mockQueueItems)
    })

    it('should remove item from pending sync queue', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await pendingSyncQueue.remove('at://did:plc:123/dev.chrispardy.recipes/1')

      expect(mockDB.delete).toHaveBeenCalledWith(
        'pendingSyncQueue',
        'at://did:plc:123/dev.chrispardy.recipes/1',
      )
    })

    it('should clear pending sync queue', async () => {
      resetDB()
      const mockStore = {
        clear: vi.fn().mockResolvedValue(undefined),
      }

      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue(mockStore),
          done: Promise.resolve(),
        }),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await pendingSyncQueue.clear()

      expect(mockStore.clear).toHaveBeenCalled()
    })

    it('should handle errors in pending sync queue operations', async () => {
      resetDB()
      const mockDB = {
        get: vi.fn(),
        getAll: vi.fn(),
        put: vi.fn().mockRejectedValue(new Error('Database error')),
        delete: vi.fn(),
        objectStoreNames: {
          contains: vi.fn().mockReturnValue(false),
        },
        createObjectStore: vi.fn().mockReturnValue({
          createIndex: vi.fn(),
        }),
      }

      const { openDB } = await import('idb')
      ;(openDB as any).mockResolvedValue(mockDB as any)

      await expect(
        pendingSyncQueue.add('test-uri', 'create'),
      ).rejects.toThrow(IndexedDBError)
    })
  })
})
