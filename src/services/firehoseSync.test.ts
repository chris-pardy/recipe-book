/**
 * Tests for Firehose Sync Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BskyAgent } from '@atproto/api'
import { FirehoseSyncService, getFirehoseSyncService } from './firehoseSync'
import * as agent from './agent'
import * as indexeddb from './indexeddb'
import { RECIPE_COLLECTION, COLLECTION_COLLECTION } from './atproto'
import type { RecipeRecord } from '../types/recipe'
import type { CollectionRecord } from '../types/collection'

// Mock dependencies
vi.mock('./agent', () => ({
  getAuthenticatedAgent: vi.fn(),
}))

vi.mock('./indexeddb', () => ({
  recipeDB: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    getPendingSync: vi.fn(),
  },
  collectionDB: {
    put: vi.fn(),
    delete: vi.fn(),
  },
  syncStateDB: {
    getLastSync: vi.fn(),
    setLastSync: vi.fn(),
  },
  getDB: vi.fn(),
}))

// Note: We don't need to mock @atproto/api since we're using the real BskyAgent class
// and just mocking the methods we need

describe('FirehoseSyncService', () => {
  let syncService: FirehoseSyncService
  let mockAgent: Partial<BskyAgent>
  let mockSubscription: AsyncIterable<unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    syncService = new FirehoseSyncService()

    // Mock agent
    mockAgent = {
      session: {
        did: 'did:plc:test123',
        handle: 'test.bsky.social',
        accessJwt: 'test-access-jwt',
        refreshJwt: 'test-refresh-jwt',
      },
      com: {
        atproto: {
          sync: {
            subscribeRepos: vi.fn(),
          },
          repo: {
            getRecord: vi.fn(),
          },
        },
      },
    } as unknown as BskyAgent

    // Mock subscription
    mockSubscription = {
      [Symbol.asyncIterator]: async function* () {
        // Empty generator by default
      },
    } as AsyncIterable<unknown>

    vi.spyOn(agent, 'getAuthenticatedAgent').mockResolvedValue(mockAgent as BskyAgent)
    vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
      mockSubscription as any,
    )
  })

  afterEach(() => {
    syncService.stop()
  })

  describe('initialize', () => {
    it('should initialize with callbacks', async () => {
      const callbacks = {
        onStatusChange: vi.fn(),
        onError: vi.fn(),
      }

      await syncService.initialize(callbacks)

      expect(syncService.getStatus()).toBe('idle')
    })
  })

  describe('start', () => {
    it('should start syncing when authenticated', async () => {
      await syncService.initialize()
      await syncService.start()

      expect(agent.getAuthenticatedAgent).toHaveBeenCalled()
      expect(mockAgent.com!.atproto.sync.subscribeRepos).toHaveBeenCalled()
    })

    it('should throw error when not authenticated', async () => {
      vi.spyOn(agent, 'getAuthenticatedAgent').mockResolvedValue(null)

      await syncService.initialize()
      await expect(syncService.start()).rejects.toThrow('Not authenticated')
    })

    it('should not start if already connected', async () => {
      await syncService.initialize()
      await syncService.start()

      const subscribeCallCount = (mockAgent.com!.atproto.sync.subscribeRepos as ReturnType<typeof vi.fn>).mock.calls.length

      await syncService.start()

      // Should not call subscribe again
      expect(
        (mockAgent.com!.atproto.sync.subscribeRepos as ReturnType<typeof vi.fn>).mock.calls.length,
      ).toBe(subscribeCallCount)
    })
  })

  describe('stop', () => {
    it('should stop syncing', async () => {
      await syncService.initialize()
      await syncService.start()

      syncService.stop()

      expect(syncService.getStatus()).toBe('idle')
    })
  })

  describe('pause/resume', () => {
    it('should pause and resume syncing', async () => {
      await syncService.initialize()
      await syncService.start()

      syncService.pause()
      expect(syncService.getStatus()).toBe('paused')

      await syncService.resume()
      expect(syncService.getStatus()).toBe('connected')
    })
  })

  describe('getSyncState', () => {
    it('should return current sync state', async () => {
      vi.spyOn(indexeddb.syncStateDB, 'getLastSync').mockResolvedValue('2024-01-01T00:00:00Z')
      vi.spyOn(indexeddb.recipeDB, 'getPendingSync').mockResolvedValue([])

      await syncService.initialize()
      const state = await syncService.getSyncState()

      expect(state.status).toBe('idle')
      expect(state.lastSyncAt).toBe('2024-01-01T00:00:00Z')
      expect(state.pendingSyncCount).toBe(0)
    })
  })

  describe('event handling', () => {
    it('should handle recipe create events', async () => {
      const recipeRecord: RecipeRecord = {
        $type: RECIPE_COLLECTION,
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(mockAgent.com!.atproto.repo, 'getRecord').mockResolvedValue({
        value: recipeRecord,
      } as any)

      const onRecipeUpdated = vi.fn()

      await syncService.initialize({ onRecipeUpdated })

      // Create a mock event stream
      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [
            {
              action: 'create',
              path: `${RECIPE_COLLECTION}/test-rkey`,
              cid: 'test-cid',
            },
          ],
          time: '2024-01-01T00:00:00Z',
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAgent.com!.atproto.repo.getRecord).toHaveBeenCalled()
      expect(indexeddb.recipeDB.put).toHaveBeenCalled()
      expect(onRecipeUpdated).toHaveBeenCalled()
    })

    it('should handle recipe update events', async () => {
      const recipeRecord: RecipeRecord = {
        $type: RECIPE_COLLECTION,
        title: 'Updated Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z',
      }

      vi.spyOn(mockAgent.com!.atproto.repo, 'getRecord').mockResolvedValue({
        value: recipeRecord,
      } as any)

      vi.spyOn(indexeddb.recipeDB, 'get').mockResolvedValue(undefined)

      const onRecipeUpdated = vi.fn()

      await syncService.initialize({ onRecipeUpdated })

      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [
            {
              action: 'update',
              path: `${RECIPE_COLLECTION}/test-rkey`,
              cid: 'test-cid',
            },
          ],
          time: '2024-01-01T01:00:00Z',
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAgent.com!.atproto.repo.getRecord).toHaveBeenCalled()
      expect(indexeddb.recipeDB.put).toHaveBeenCalled()
      expect(onRecipeUpdated).toHaveBeenCalled()
    })

    it('should handle recipe delete events', async () => {
      const onRecipeDeleted = vi.fn()

      await syncService.initialize({ onRecipeDeleted })

      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [
            {
              action: 'delete',
              path: `${RECIPE_COLLECTION}/test-rkey`,
            },
          ],
          time: '2024-01-01T00:00:00Z',
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(indexeddb.recipeDB.delete).toHaveBeenCalled()
      expect(onRecipeDeleted).toHaveBeenCalled()
    })

    it('should handle collection events', async () => {
      const collectionRecord: CollectionRecord = {
        $type: COLLECTION_COLLECTION,
        name: 'Test Collection',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      vi.spyOn(mockAgent.com!.atproto.repo, 'getRecord').mockResolvedValue({
        value: collectionRecord,
      } as any)

      const onCollectionUpdated = vi.fn()

      await syncService.initialize({ onCollectionUpdated })

      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [
            {
              action: 'create',
              path: `${COLLECTION_COLLECTION}/test-rkey`,
              cid: 'test-cid',
            },
          ],
          time: '2024-01-01T00:00:00Z',
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAgent.com!.atproto.repo.getRecord).toHaveBeenCalled()
      expect(indexeddb.collectionDB.put).toHaveBeenCalled()
      expect(onCollectionUpdated).toHaveBeenCalled()
    })

    it('should ignore events from other repositories', async () => {
      await syncService.initialize()

      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:other-user',
          ops: [
            {
              action: 'create',
              path: `${RECIPE_COLLECTION}/test-rkey`,
            },
          ],
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAgent.com!.atproto.repo.getRecord).not.toHaveBeenCalled()
    })

    it('should handle conflict resolution (last-write-wins)', async () => {
      const remoteRecipe: RecipeRecord = {
        $type: RECIPE_COLLECTION,
        title: 'Remote Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T02:00:00Z', // Newer
      }

      const localRecipe = {
        title: 'Local Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T01:00:00Z', // Older
        uri: 'at://did:plc:test123/dev.chrispardy.recipes/test-rkey',
        pendingSync: true,
      }

      vi.spyOn(mockAgent.com!.atproto.repo, 'getRecord').mockResolvedValue({
        value: remoteRecipe,
      } as any)

      vi.spyOn(indexeddb.recipeDB, 'get').mockResolvedValue(localRecipe as any)

      await syncService.initialize()

      const eventStream = async function* () {
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [
            {
              action: 'update',
              path: `${RECIPE_COLLECTION}/test-rkey`,
              cid: 'test-cid',
            },
          ],
          time: '2024-01-01T02:00:00Z',
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.start()

      await new Promise(resolve => setTimeout(resolve, 100))

      // Should use remote version (newer)
      expect(indexeddb.recipeDB.put).toHaveBeenCalledWith(
        expect.stringContaining('test-rkey'),
        remoteRecipe,
        'test-cid',
        false,
      )
    })
  })

  describe('reconnection', () => {
    it('should attempt reconnection on error', async () => {
      let callCount = 0
      const eventStream = async function* () {
        callCount++
        if (callCount === 1) {
          throw new Error('Connection error')
        }
        // Second attempt succeeds
        yield {
          $type: 'com.atproto.sync.subscribeRepos#commit',
          repo: 'did:plc:test123',
          ops: [],
        }
      }

      vi.spyOn(mockAgent.com!.atproto.sync, 'subscribeRepos').mockReturnValue(
        eventStream() as any,
      )

      await syncService.initialize()
      await syncService.start()

      // Wait for reconnection
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Should have attempted reconnection
      expect((mockAgent.com!.atproto.sync.subscribeRepos as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
    })
  })
})

describe('getFirehoseSyncService', () => {
  it('should return singleton instance', () => {
    const service1 = getFirehoseSyncService()
    const service2 = getFirehoseSyncService()

    expect(service1).toBe(service2)
  })
})
