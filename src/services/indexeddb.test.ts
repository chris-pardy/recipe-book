import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDB, getDB, recipeDB, collectionDB, syncStateDB, resetDB } from './indexeddb'
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
      }

      const { openDB } = await import('idb')
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

      await initDB()

      expect(openDB).toHaveBeenCalledWith('recipe-book', 1, expect.any(Object))
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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

      await recipeDB.put('at://did:plc:123/dev.chrispardy.recipes/1', recipe, 'cid123')

      expect(mockDB.put).toHaveBeenCalledWith(
        'recipes',
        expect.objectContaining({
          ...recipe,
          uri: 'at://did:plc:123/dev.chrispardy.recipes/1',
          cid: 'cid123',
          indexedAt: expect.any(String),
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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

      const results = await recipeDB.searchByTitle('chocolate')

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

      const result = await syncStateDB.getLastSync()

      expect(result).toBe('2024-01-01T00:00:00Z')
    })

    it('should return null if no sync state exists', async () => {
      const mockDB = {
        get: vi.fn().mockResolvedValue(undefined),
      }

      const { openDB } = await import('idb')
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
      vi.mocked(openDB).mockResolvedValue(mockDB as any)

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
  })
})
