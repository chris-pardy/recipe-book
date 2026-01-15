/**
 * Unit tests for collections service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BskyAgent } from '@atproto/api'
import {
  getOrCreateDefaultCollection,
  createNewCollection,
  addRecipeToCollection,
  removeRecipeFromCollection,
  deleteCollectionComplete,
  getCollectionsForRecipe,
  ensureRecipeInDefaultCollection,
  DEFAULT_COLLECTION_NAME,
  CollectionError,
} from './collections'
import * as atproto from './atproto'
import * as indexeddb from './indexeddb'
import * as agent from './agent'
import type { Collection } from '../types/collection'

// Mock dependencies
vi.mock('./atproto', () => ({
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  getCollection: vi.fn(),
}))

vi.mock('./indexeddb', () => ({
  collectionDB: {
    getAll: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('./agent', () => ({
  getAuthenticatedAgent: vi.fn(),
}))

describe('collections service', () => {
  let mockAgent: BskyAgent
  const mockDid = 'did:plc:test123'
  const mockUri = 'at://did:plc:test123/dev.chrispardy.collections/test'

  beforeEach(() => {
    vi.clearAllMocks()

    mockAgent = {
      session: {
        did: mockDid,
        handle: 'test.bsky.social',
        accessJwt: 'test-jwt',
        refreshJwt: 'test-refresh',
      },
      com: {
        atproto: {
          repo: {
            listRecords: vi.fn(),
          },
        },
      },
    } as unknown as BskyAgent

    vi.spyOn(agent, 'getAuthenticatedAgent').mockResolvedValue(mockAgent)
  })

  describe('getOrCreateDefaultCollection', () => {
    it('should return existing collection from IndexedDB', async () => {
      const existingCollection: Collection & { uri: string } = {
        uri: mockUri,
        name: DEFAULT_COLLECTION_NAME,
        description: 'My saved recipes',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'getAll').mockResolvedValue([
        existingCollection,
      ])

      const result = await getOrCreateDefaultCollection(mockAgent)

      expect(result.uri).toBe(mockUri)
      expect(result.collection.name).toBe(DEFAULT_COLLECTION_NAME)
      expect(indexeddb.collectionDB.getAll).toHaveBeenCalledOnce()
    })

    it('should fetch from PDS if not in IndexedDB', async () => {
      const pdsCollection: Collection = {
        name: DEFAULT_COLLECTION_NAME,
        description: 'My saved recipes',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'getAll').mockResolvedValue([])
      vi.spyOn(mockAgent.com.atproto.repo, 'listRecords').mockResolvedValue({
        records: [
          {
            uri: mockUri,
            value: pdsCollection,
            cid: 'test-cid',
          },
        ],
        cursor: undefined,
      } as any)
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()

      const result = await getOrCreateDefaultCollection(mockAgent)

      expect(result.uri).toBe(mockUri)
      expect(result.collection.name).toBe(DEFAULT_COLLECTION_NAME)
      expect(indexeddb.collectionDB.put).toHaveBeenCalledWith(
        mockUri,
        pdsCollection,
        'test-cid',
      )
    })

    it('should create default collection if it does not exist', async () => {
      vi.spyOn(indexeddb.collectionDB, 'getAll').mockResolvedValue([])
      vi.spyOn(mockAgent.com.atproto.repo, 'listRecords').mockResolvedValue({
        records: [],
        cursor: undefined,
      } as any)
      vi.spyOn(atproto, 'createCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()

      const result = await getOrCreateDefaultCollection(mockAgent)

      expect(result.uri).toBe(mockUri)
      expect(result.collection.name).toBe(DEFAULT_COLLECTION_NAME)
      expect(atproto.createCollection).toHaveBeenCalledWith(mockAgent, {
        name: DEFAULT_COLLECTION_NAME,
        description: 'My saved recipes',
        recipeUris: [],
      })
      expect(indexeddb.collectionDB.put).toHaveBeenCalled()
    })
  })

  describe('createNewCollection', () => {
    it('should create a new collection', async () => {
      const collectionData = {
        name: 'Desserts',
        description: 'Sweet treats',
        recipeUris: [],
      }

      vi.spyOn(atproto, 'createCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()

      const result = await createNewCollection(
        mockAgent,
        collectionData.name,
        collectionData.description,
      )

      expect(result.uri).toBe(mockUri)
      expect(atproto.createCollection).toHaveBeenCalledWith(mockAgent, {
        name: 'Desserts',
        description: 'Sweet treats',
        recipeUris: [],
      })
      expect(indexeddb.collectionDB.put).toHaveBeenCalled()
    })

    it('should throw error if name is empty', async () => {
      await expect(
        createNewCollection(mockAgent, '   ', 'description'),
      ).rejects.toThrow(CollectionError)
    })
  })

  describe('addRecipeToCollection', () => {
    it('should add recipe to collection', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collection: Collection & { uri: string } = {
        uri: mockUri,
        name: 'Test Collection',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'get').mockResolvedValue(collection)
      vi.spyOn(atproto, 'updateCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()

      await addRecipeToCollection(mockAgent, mockUri, recipeUri)

      expect(atproto.updateCollection).toHaveBeenCalledWith(mockAgent, mockUri, {
        recipeUris: [recipeUri],
      })
      expect(indexeddb.collectionDB.put).toHaveBeenCalled()
    })

    it('should not add recipe if already in collection', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collection: Collection & { uri: string } = {
        uri: mockUri,
        name: 'Test Collection',
        recipeUris: [recipeUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'get').mockResolvedValue(collection)

      await addRecipeToCollection(mockAgent, mockUri, recipeUri)

      expect(atproto.updateCollection).not.toHaveBeenCalled()
    })

    it('should fetch from PDS if not in IndexedDB', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collection: Collection = {
        name: 'Test Collection',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'get')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          ...collection,
          uri: mockUri,
        })
      vi.spyOn(atproto, 'getCollection').mockResolvedValue(collection)
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()
      vi.spyOn(atproto, 'updateCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })

      await addRecipeToCollection(mockAgent, mockUri, recipeUri)

      expect(atproto.getCollection).toHaveBeenCalledWith(mockAgent, mockUri)
      expect(atproto.updateCollection).toHaveBeenCalled()
    })
  })

  describe('removeRecipeFromCollection', () => {
    it('should remove recipe from collection', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collection: Collection & { uri: string } = {
        uri: mockUri,
        name: 'Test Collection',
        recipeUris: [recipeUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'get').mockResolvedValue(collection)
      vi.spyOn(atproto, 'updateCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()

      await removeRecipeFromCollection(mockAgent, mockUri, recipeUri)

      expect(atproto.updateCollection).toHaveBeenCalledWith(mockAgent, mockUri, {
        recipeUris: [],
      })
      expect(indexeddb.collectionDB.put).toHaveBeenCalled()
    })

    it('should not remove recipe if not in collection', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collection: Collection & { uri: string } = {
        uri: mockUri,
        name: 'Test Collection',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(indexeddb.collectionDB, 'get').mockResolvedValue(collection)

      await removeRecipeFromCollection(mockAgent, mockUri, recipeUri)

      expect(atproto.updateCollection).not.toHaveBeenCalled()
    })
  })

  describe('deleteCollectionComplete', () => {
    it('should delete collection from PDS and IndexedDB', async () => {
      vi.spyOn(atproto, 'deleteCollection').mockResolvedValue()
      vi.spyOn(indexeddb.collectionDB, 'delete').mockResolvedValue()

      await deleteCollectionComplete(mockAgent, mockUri)

      expect(atproto.deleteCollection).toHaveBeenCalledWith(mockAgent, mockUri)
      expect(indexeddb.collectionDB.delete).toHaveBeenCalledWith(mockUri)
    })
  })

  describe('getCollectionsForRecipe', () => {
    it('should return collections containing the recipe', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'
      const collections: (Collection & { uri: string })[] = [
        {
          uri: mockUri,
          name: 'Collection 1',
          recipeUris: [recipeUri],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:plc:test123/dev.chrispardy.collections/other',
          name: 'Collection 2',
          recipeUris: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]

      vi.spyOn(indexeddb.collectionDB, 'getAll').mockResolvedValue(collections)

      const result = await getCollectionsForRecipe(recipeUri)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Collection 1')
    })
  })

  describe('ensureRecipeInDefaultCollection', () => {
    it('should add recipe to default collection', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'

      vi.spyOn(agent, 'getAuthenticatedAgent').mockResolvedValue(mockAgent)
      vi.spyOn(indexeddb.collectionDB, 'getAll').mockResolvedValue([])
      vi.spyOn(mockAgent.com.atproto.repo, 'listRecords').mockResolvedValue({
        records: [],
        cursor: undefined,
      } as any)
      vi.spyOn(atproto, 'createCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })
      vi.spyOn(indexeddb.collectionDB, 'put').mockResolvedValue()
      vi.spyOn(indexeddb.collectionDB, 'get').mockResolvedValue({
        uri: mockUri,
        name: DEFAULT_COLLECTION_NAME,
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      })
      vi.spyOn(atproto, 'updateCollection').mockResolvedValue({
        uri: mockUri,
        cid: 'test-cid',
      })

      await ensureRecipeInDefaultCollection(recipeUri)

      expect(atproto.updateCollection).toHaveBeenCalled()
    })

    it('should not throw if not authenticated', async () => {
      const recipeUri = 'at://did:plc:test123/dev.chrispardy.recipes/recipe1'

      vi.spyOn(agent, 'getAuthenticatedAgent').mockResolvedValue(null)

      // Should resolve without throwing
      await ensureRecipeInDefaultCollection(recipeUri)
      
      // Verify that no collection operations were attempted
      expect(agent.getAuthenticatedAgent).toHaveBeenCalled()
      expect(atproto.createCollection).not.toHaveBeenCalled()
      expect(atproto.updateCollection).not.toHaveBeenCalled()
    })
  })
})
