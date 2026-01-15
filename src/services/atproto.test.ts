import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAtProtoAgent,
  authenticateAgent,
  getDefaultService,
  createRecipe,
  getRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipes,
  createCollection,
  getCollection,
  updateCollection,
  deleteCollection,
  listCollections,
  RECIPE_COLLECTION,
  COLLECTION_COLLECTION,
  AtProtoError,
  RateLimitError,
  NotFoundError,
  AuthenticationError,
} from './atproto'
import type { AtProtoSession } from '../types'
import type { Recipe } from '../types/recipe'
import type { Collection } from '../types/collection'

// Mock @atproto/api
const mockCreateRecord = vi.fn()
const mockGetRecord = vi.fn()
const mockListRecords = vi.fn()
const mockPutRecord = vi.fn()
const mockDeleteRecord = vi.fn()

vi.mock('@atproto/api', () => {
  class MockBskyAgent {
    service: string
    session: any = null

    constructor(config: { service: string }) {
      this.service = config.service
      this.session = null
    }

    com = {
      atproto: {
        repo: {
          createRecord: mockCreateRecord,
          getRecord: mockGetRecord,
          listRecords: mockListRecords,
          putRecord: mockPutRecord,
          deleteRecord: mockDeleteRecord,
        },
      },
    }
  }

  return {
    BskyAgent: MockBskyAgent,
  }
})

describe('ATProto Service', () => {
  const mockSession: AtProtoSession = {
    did: 'did:plc:abc123',
    handle: 'test.bsky.social',
    accessJwt: 'access-token',
    refreshJwt: 'refresh-token',
  }

  const mockRecipe: Recipe = {
    title: 'Test Recipe',
    servings: 4,
    ingredients: [
      { id: '1', name: 'flour', amount: 240, unit: 'g' },
      { id: '2', name: 'sugar', amount: 60, unit: 'g' },
    ],
    steps: [
      { id: '1', text: 'Mix flour and sugar', order: 1 },
      { id: '2', text: 'Bake at 350F', order: 2 },
    ],
  }

  const mockCollection: Collection = {
    name: 'My Recipes',
    description: 'Test collection',
    recipeUris: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createAtProtoAgent', () => {
    it('should create an agent with the correct service URL', () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })

      expect(agent.service).toBe('https://bsky.social')
      expect(agent).toBeDefined()
    })
  })

  describe('authenticateAgent', () => {
    it('should set session on agent', () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })

      authenticateAgent(agent, mockSession)

      expect(agent.session).toEqual({
        did: 'did:plc:abc123',
        handle: 'test.bsky.social',
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
      })
    })
  })

  describe('getDefaultService', () => {
    it('should return the default Bluesky service URL', () => {
      const service = getDefaultService()
      expect(service).toBe('https://bsky.social')
    })
  })

  describe('Recipe CRUD Operations', () => {
    describe('createRecipe', () => {
      it('should create a recipe record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          uri: 'at://did:plc:abc123/dev.chrispardy.recipes/123',
          cid: { toString: () => 'mock-cid-123' },
        }

        mockCreateRecord.mockResolvedValue(mockResponse)

        const result = await createRecipe(agent, mockRecipe)

        expect(result.uri).toBe('at://did:plc:abc123/dev.chrispardy.recipes/123')
        expect(result.cid).toBe('mock-cid-123')
        expect(mockCreateRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          record: expect.objectContaining({
            $type: RECIPE_COLLECTION,
            title: 'Test Recipe',
            servings: 4,
            ingredients: mockRecipe.ingredients,
            steps: mockRecipe.steps,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        })
      })

      it('should throw AuthenticationError if not authenticated', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })

        await expect(createRecipe(agent, mockRecipe)).rejects.toThrow(
          AuthenticationError,
        )
      })

      it('should handle rate limit errors with retry', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          uri: 'at://did:plc:abc123/dev.chrispardy.recipes/123',
          cid: { toString: () => 'mock-cid-123' },
        }

        // First call fails with rate limit, second succeeds
        mockCreateRecord
          .mockRejectedValueOnce({ statusCode: 429 })
          .mockResolvedValueOnce(mockResponse)

        const resultPromise = createRecipe(agent, mockRecipe)

        // Advance timer for retry delay
        await vi.advanceTimersByTimeAsync(2000)

        const result = await resultPromise

        expect(result.uri).toBe('at://did:plc:abc123/dev.chrispardy.recipes/123')
        expect(mockCreateRecord).toHaveBeenCalledTimes(2)
      })

      it('should throw AtProtoError on generic errors', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        mockCreateRecord.mockRejectedValue(new Error('Network error'))

        await expect(createRecipe(agent, mockRecipe)).rejects.toThrow(
          AtProtoError,
        )
      })
    })

    describe('getRecipe', () => {
      it('should get a recipe record by URI', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        const mockResponse = {
          value: {
            $type: RECIPE_COLLECTION,
            ...mockRecipe,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        }

        mockGetRecord.mockResolvedValue(mockResponse)

        const result = await getRecipe(agent, uri)

        expect(result).toEqual(mockResponse.value)
        expect(mockGetRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          rkey: '123',
        })
      })

      it('should return null if recipe not found', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        mockGetRecord.mockRejectedValue({ statusCode: 404 })

        const result = await getRecipe(agent, uri)

        expect(result).toBeNull()
      })

      it('should throw AtProtoError for invalid URI', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'invalid-uri'

        await expect(getRecipe(agent, uri)).rejects.toThrow(AtProtoError)
      })

      it('should throw AtProtoError for wrong collection', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/wrong.collection/123'

        await expect(getRecipe(agent, uri)).rejects.toThrow(AtProtoError)
      })
    })

    describe('updateRecipe', () => {
      it('should update a recipe record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        const existingRecord = {
          value: {
            $type: RECIPE_COLLECTION,
            ...mockRecipe,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        }

        const updatedResponse = {
          uri,
          cid: { toString: () => 'mock-cid-updated' },
        }

        mockGetRecord.mockResolvedValue(existingRecord)
        mockPutRecord.mockResolvedValue(updatedResponse)

        const updates = { title: 'Updated Recipe' }
        const result = await updateRecipe(agent, uri, updates)

        expect(result.uri).toBe(uri)
        expect(mockPutRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          rkey: '123',
          record: expect.objectContaining({
            title: 'Updated Recipe',
            updatedAt: expect.any(String),
          }),
        })
      })

      it('should throw NotFoundError if recipe not found', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        mockGetRecord.mockRejectedValue({ statusCode: 404 })

        await expect(updateRecipe(agent, uri, { title: 'Updated' })).rejects.toThrow(
          NotFoundError,
        )
      })

      it('should throw AuthenticationError if not authenticated', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        await expect(updateRecipe(agent, uri, { title: 'Updated' })).rejects.toThrow(
          AuthenticationError,
        )
      })
    })

    describe('deleteRecipe', () => {
      it('should delete a recipe record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        mockDeleteRecord.mockResolvedValue(undefined)

        await deleteRecipe(agent, uri)

        expect(mockDeleteRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          rkey: '123',
        })
      })

      it('should throw NotFoundError if recipe not found', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        mockDeleteRecord.mockRejectedValue({ statusCode: 404 })

        await expect(deleteRecipe(agent, uri)).rejects.toThrow(NotFoundError)
      })

      it('should throw AuthenticationError if not authenticated', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/123'

        await expect(deleteRecipe(agent, uri)).rejects.toThrow(
          AuthenticationError,
        )
      })
    })

    describe('listRecipes', () => {
      it('should list recipe records', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          records: [
            {
              value: {
                $type: RECIPE_COLLECTION,
                ...mockRecipe,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              },
            },
          ],
          cursor: 'next-cursor',
        }

        mockListRecords.mockResolvedValue(mockResponse)

        const result = await listRecipes(agent, 50)

        expect(result.records).toHaveLength(1)
        expect(result.cursor).toBe('next-cursor')
        expect(mockListRecords).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          limit: 50,
          cursor: undefined,
        })
      })

      it('should support pagination with cursor', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          records: [],
          cursor: 'next-cursor',
        }

        mockListRecords.mockResolvedValue(mockResponse)

        await listRecipes(agent, 50, 'previous-cursor')

        expect(mockListRecords).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: RECIPE_COLLECTION,
          limit: 50,
          cursor: 'previous-cursor',
        })
      })

      it('should throw AuthenticationError if not authenticated', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })

        await expect(listRecipes(agent)).rejects.toThrow(AuthenticationError)
      })
    })
  })

  describe('Collection CRUD Operations', () => {
    describe('createCollection', () => {
      it('should create a collection record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          uri: 'at://did:plc:abc123/dev.chrispardy.collections/123',
          cid: { toString: () => 'mock-cid-123' },
        }

        mockCreateRecord.mockResolvedValue(mockResponse)

        const result = await createCollection(agent, mockCollection)

        expect(result.uri).toBe(
          'at://did:plc:abc123/dev.chrispardy.collections/123',
        )
        expect(result.cid).toBe('mock-cid-123')
        expect(mockCreateRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: COLLECTION_COLLECTION,
          record: expect.objectContaining({
            $type: COLLECTION_COLLECTION,
            name: 'My Recipes',
            description: 'Test collection',
            recipeUris: [],
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        })
      })

      it('should throw AuthenticationError if not authenticated', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })

        await expect(createCollection(agent, mockCollection)).rejects.toThrow(
          AuthenticationError,
        )
      })
    })

    describe('getCollection', () => {
      it('should get a collection record by URI', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.collections/123'

        const mockResponse = {
          value: {
            $type: COLLECTION_COLLECTION,
            ...mockCollection,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        }

        mockGetRecord.mockResolvedValue(mockResponse)

        const result = await getCollection(agent, uri)

        expect(result).toEqual(mockResponse.value)
        expect(mockGetRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: COLLECTION_COLLECTION,
          rkey: '123',
        })
      })

      it('should return null if collection not found', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        const uri = 'at://did:plc:abc123/dev.chrispardy.collections/123'

        mockGetRecord.mockRejectedValue({ statusCode: 404 })

        const result = await getCollection(agent, uri)

        expect(result).toBeNull()
      })
    })

    describe('updateCollection', () => {
      it('should update a collection record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.collections/123'

        const existingRecord = {
          value: {
            $type: COLLECTION_COLLECTION,
            ...mockCollection,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        }

        const updatedResponse = {
          uri,
          cid: { toString: () => 'mock-cid-updated' },
        }

        mockGetRecord.mockResolvedValue(existingRecord)
        mockPutRecord.mockResolvedValue(updatedResponse)

        const updates = { name: 'Updated Collection' }
        const result = await updateCollection(agent, uri, updates)

        expect(result.uri).toBe(uri)
        expect(mockPutRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: COLLECTION_COLLECTION,
          rkey: '123',
          record: expect.objectContaining({
            name: 'Updated Collection',
            updatedAt: expect.any(String),
          }),
        })
      })
    })

    describe('deleteCollection', () => {
      it('should delete a collection record', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)
        const uri = 'at://did:plc:abc123/dev.chrispardy.collections/123'

        mockDeleteRecord.mockResolvedValue(undefined)

        await deleteCollection(agent, uri)

        expect(mockDeleteRecord).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: COLLECTION_COLLECTION,
          rkey: '123',
        })
      })
    })

    describe('listCollections', () => {
      it('should list collection records', async () => {
        const agent = createAtProtoAgent({ service: 'https://bsky.social' })
        authenticateAgent(agent, mockSession)

        const mockResponse = {
          records: [
            {
              value: {
                $type: COLLECTION_COLLECTION,
                ...mockCollection,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
              },
            },
          ],
          cursor: 'next-cursor',
        }

        mockListRecords.mockResolvedValue(mockResponse)

        const result = await listCollections(agent, 50)

        expect(result.records).toHaveLength(1)
        expect(result.cursor).toBe('next-cursor')
        expect(mockListRecords).toHaveBeenCalledWith({
          repo: 'did:plc:abc123',
          collection: COLLECTION_COLLECTION,
          limit: 50,
          cursor: undefined,
        })
      })
    })
  })

  describe('Error Handling', () => {
    it('should retry on rate limit errors', async () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })
      authenticateAgent(agent, mockSession)

      const mockResponse = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/123',
        cid: { toString: () => 'mock-cid-123' },
      }

      // First two calls fail with rate limit, third succeeds
      mockCreateRecord
        .mockRejectedValueOnce({ statusCode: 429 })
        .mockRejectedValueOnce({ statusCode: 429 })
        .mockResolvedValueOnce(mockResponse)

      const resultPromise = createRecipe(agent, mockRecipe)

      // Advance timer for retry delays (exponential backoff)
      await vi.advanceTimersByTimeAsync(2000) // First retry
      await vi.advanceTimersByTimeAsync(4000) // Second retry

      const result = await resultPromise

      expect(result.uri).toBe('at://did:plc:abc123/dev.chrispardy.recipes/123')
      expect(mockCreateRecord).toHaveBeenCalledTimes(3)
    })

    it('should throw error after max retries', async () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })
      authenticateAgent(agent, mockSession)

      // All retries fail with rate limit
      mockCreateRecord.mockRejectedValue({ statusCode: 429 })

      // Start the operation and immediately catch any errors
      const resultPromise = createRecipe(agent, mockRecipe).catch(err => err)

      // Advance timers to trigger all retries
      // Exponential backoff: 2s, 4s, 8s = 14s total
      await vi.advanceTimersByTimeAsync(15000)

      // Wait for the promise to settle
      const error = await resultPromise

      // Verify it throws after all retries
      expect(error).toBeInstanceOf(RateLimitError)
      expect(mockCreateRecord).toHaveBeenCalledTimes(4) // Initial + 3 retries
    })

    it('should not retry on non-retryable errors', async () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })
      authenticateAgent(agent, mockSession)

      mockCreateRecord.mockRejectedValue({ statusCode: 400 })

      await expect(createRecipe(agent, mockRecipe)).rejects.toThrow(
        AtProtoError,
      )
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
  })
})
