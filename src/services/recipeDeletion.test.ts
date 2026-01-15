import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteRecipeComplete } from './recipeDeletion'
import { deleteRecipe, updateCollection } from './atproto'
import { recipeDB, collectionDB } from './indexeddb'
import type { BskyAgent } from '@atproto/api'
import type { Collection } from '../types/collection'

// Mock dependencies
vi.mock('./atproto', () => ({
  deleteRecipe: vi.fn(),
  updateCollection: vi.fn(),
}))

vi.mock('./indexeddb', () => ({
  recipeDB: {
    delete: vi.fn(),
  },
  collectionDB: {
    getAll: vi.fn(),
    put: vi.fn(),
  },
}))

describe('recipeDeletion', () => {
  const mockAgent = {} as BskyAgent
  const recipeUri = 'at://did:plc:abc123/dev.chrispardy.recipes/rkey123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete recipe from PDS, IndexedDB, and remove from collections', async () => {
    const collection1: Collection & { uri: string } = {
      uri: 'at://did:plc:abc123/dev.chrispardy.collections/col1',
      name: 'Collection 1',
      recipeUris: [recipeUri, 'at://did:plc:abc123/dev.chrispardy.recipes/other'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const collection2: Collection & { uri: string } = {
      uri: 'at://did:plc:abc123/dev.chrispardy.collections/col2',
      name: 'Collection 2',
      recipeUris: [recipeUri],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const collection3: Collection & { uri: string } = {
      uri: 'at://did:plc:abc123/dev.chrispardy.collections/col3',
      name: 'Collection 3',
      recipeUris: ['at://did:plc:abc123/dev.chrispardy.recipes/other'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    vi.mocked(collectionDB.getAll).mockResolvedValue([
      collection1,
      collection2,
      collection3,
    ])

    await deleteRecipeComplete(mockAgent, recipeUri)

    // Should update collections 1 and 2 (they contain the recipe)
    expect(updateCollection).toHaveBeenCalledTimes(2)
    expect(updateCollection).toHaveBeenCalledWith(mockAgent, collection1.uri, {
      recipeUris: ['at://did:plc:abc123/dev.chrispardy.recipes/other'],
    })
    expect(updateCollection).toHaveBeenCalledWith(mockAgent, collection2.uri, {
      recipeUris: [],
    })

    // Should update IndexedDB collections
    expect(collectionDB.put).toHaveBeenCalledTimes(2)
    expect(collectionDB.put).toHaveBeenCalledWith(collection1.uri, {
      ...collection1,
      recipeUris: ['at://did:plc:abc123/dev.chrispardy.recipes/other'],
    })
    expect(collectionDB.put).toHaveBeenCalledWith(collection2.uri, {
      ...collection2,
      recipeUris: [],
    })

    // Should delete from PDS
    expect(deleteRecipe).toHaveBeenCalledWith(mockAgent, recipeUri)

    // Should delete from IndexedDB
    expect(recipeDB.delete).toHaveBeenCalledWith(recipeUri)
  })

  it('should handle recipe not in any collections', async () => {
    vi.mocked(collectionDB.getAll).mockResolvedValue([])

    await deleteRecipeComplete(mockAgent, recipeUri)

    // Should not update any collections
    expect(updateCollection).not.toHaveBeenCalled()
    expect(collectionDB.put).not.toHaveBeenCalled()

    // Should still delete from PDS and IndexedDB
    expect(deleteRecipe).toHaveBeenCalledWith(mockAgent, recipeUri)
    expect(recipeDB.delete).toHaveBeenCalledWith(recipeUri)
  })

  it('should handle errors during collection update', async () => {
    const collection: Collection & { uri: string } = {
      uri: 'at://did:plc:abc123/dev.chrispardy.collections/col1',
      name: 'Collection 1',
      recipeUris: [recipeUri],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    vi.mocked(collectionDB.getAll).mockResolvedValue([collection])
    vi.mocked(updateCollection).mockRejectedValue(new Error('Update failed'))

    await expect(deleteRecipeComplete(mockAgent, recipeUri)).rejects.toThrow(
      'Update failed',
    )

    // Should not proceed to delete from PDS if collection update fails
    expect(deleteRecipe).not.toHaveBeenCalled()
    expect(recipeDB.delete).not.toHaveBeenCalled()
  })

  it('should handle errors during PDS deletion', async () => {
    vi.mocked(collectionDB.getAll).mockResolvedValue([])
    vi.mocked(deleteRecipe).mockRejectedValue(new Error('Delete failed'))

    await expect(deleteRecipeComplete(mockAgent, recipeUri)).rejects.toThrow(
      'Delete failed',
    )

    // Should not delete from IndexedDB if PDS deletion fails
    expect(recipeDB.delete).not.toHaveBeenCalled()
  })
})
