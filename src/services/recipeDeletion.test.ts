import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteRecipeComplete } from './recipeDeletion'
import { deleteRecipe, updateCollection, updateRecipe } from './atproto'
import { recipeDB, collectionDB } from './indexeddb'
import { getParentRecipes } from '../utils/subRecipeValidation'
import type { BskyAgent } from '@atproto/api'
import type { Collection } from '../types/collection'
import type { Recipe } from '../types/recipe'

// Mock dependencies
vi.mock('./atproto', () => ({
  deleteRecipe: vi.fn(),
  updateCollection: vi.fn(),
  updateRecipe: vi.fn(),
}))

vi.mock('./indexeddb', () => ({
  recipeDB: {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    getAll: vi.fn(),
  },
  collectionDB: {
    getAll: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../utils/subRecipeValidation', () => ({
  getParentRecipes: vi.fn(),
}))

describe('recipeDeletion', () => {
  const mockAgent = {} as BskyAgent
  const recipeUri = 'at://did:plc:abc123/dev.chrispardy.recipes/rkey123'

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for getParentRecipes to return empty array
    ;(getParentRecipes as any).mockResolvedValue([])
    // Default mock for deleteRecipe to succeed
    ;(deleteRecipe as any).mockResolvedValue(undefined)
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

    ;(collectionDB.getAll as any).mockResolvedValue([
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
    ;(collectionDB.getAll as any).mockResolvedValue([])

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

      ;(collectionDB.getAll as any).mockResolvedValue([collection])
      ;(updateCollection as any).mockRejectedValue(new Error('Update failed'))

      // Implementation continues even if collection update fails, but throws at end
      await expect(deleteRecipeComplete(mockAgent, recipeUri)).rejects.toThrow(
        'Recipe deletion completed with errors',
      )

      // Should still attempt to delete from PDS (implementation continues on errors)
      expect(deleteRecipe).toHaveBeenCalled()
      expect(recipeDB.delete).toHaveBeenCalled()
    })

    it('should handle errors during PDS deletion', async () => {
      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(deleteRecipe as any).mockRejectedValue(new Error('Delete failed'))

      // Implementation continues even if PDS deletion fails, but throws at end
      await expect(deleteRecipeComplete(mockAgent, recipeUri)).rejects.toThrow(
        'Recipe deletion completed with errors',
      )

      // Should still attempt to delete from IndexedDB (implementation continues on errors)
      expect(recipeDB.delete).toHaveBeenCalled()
    })

  describe('Sub-recipe deletion handling', () => {
    it('should remove deleted recipe from parent recipes subRecipes arrays', async () => {
      const parentRecipe1: Recipe & { uri: string } = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/parent1',
        title: 'Parent Recipe 1',
        servings: 4,
        ingredients: [],
        steps: [],
        subRecipes: [recipeUri, 'at://did:plc:abc123/dev.chrispardy.recipes/other'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      const parentRecipe2: Recipe & { uri: string } = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/parent2',
        title: 'Parent Recipe 2',
        servings: 6,
        ingredients: [],
        steps: [],
        subRecipes: [recipeUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(getParentRecipes as any).mockResolvedValue([
        parentRecipe1.uri,
        parentRecipe2.uri,
      ])
      ;(recipeDB.get as any)
        .mockResolvedValueOnce(parentRecipe1)
        .mockResolvedValueOnce(parentRecipe2)

      await deleteRecipeComplete(mockAgent, recipeUri)

      // Should update both parent recipes
      expect(updateRecipe).toHaveBeenCalledTimes(2)
      expect(updateRecipe).toHaveBeenCalledWith(mockAgent, parentRecipe1.uri, {
        subRecipes: ['at://did:plc:abc123/dev.chrispardy.recipes/other'],
      })
      expect(updateRecipe).toHaveBeenCalledWith(mockAgent, parentRecipe2.uri, {
        subRecipes: undefined,
      })

      // Should update IndexedDB
      expect(recipeDB.put).toHaveBeenCalledTimes(2)
      expect(recipeDB.put).toHaveBeenCalledWith(
        parentRecipe1.uri,
        expect.objectContaining({
          subRecipes: ['at://did:plc:abc123/dev.chrispardy.recipes/other'],
        }),
      )
      expect(recipeDB.put).toHaveBeenCalledWith(
        parentRecipe2.uri,
        expect.objectContaining({
          subRecipes: undefined,
        }),
      )
    })

    it('should handle parent recipe with no other sub-recipes', async () => {
      const parentRecipe: Recipe & { uri: string } = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/parent',
        title: 'Parent Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        subRecipes: [recipeUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(getParentRecipes as any).mockResolvedValue([parentRecipe.uri])
      ;(recipeDB.get as any).mockResolvedValueOnce(parentRecipe)

      await deleteRecipeComplete(mockAgent, recipeUri)

      // Should update parent recipe with undefined subRecipes (empty array removed)
      expect(updateRecipe).toHaveBeenCalledWith(mockAgent, parentRecipe.uri, {
        subRecipes: undefined,
      })
    })

    it('should handle parent recipe without subRecipes field', async () => {
      const parentRecipe: Recipe & { uri: string } = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/parent',
        title: 'Parent Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(getParentRecipes as any).mockResolvedValue([parentRecipe.uri])
      ;(recipeDB.get as any).mockResolvedValueOnce(parentRecipe)

      await deleteRecipeComplete(mockAgent, recipeUri)

      // Should not update parent recipe if it has no subRecipes
      expect(updateRecipe).not.toHaveBeenCalled()
    })

    it('should handle errors when updating parent recipes', async () => {
      const parentRecipe: Recipe & { uri: string } = {
        uri: 'at://did:plc:abc123/dev.chrispardy.recipes/parent',
        title: 'Parent Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        subRecipes: [recipeUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(getParentRecipes as any).mockResolvedValue([parentRecipe.uri])
      ;(recipeDB.get as any).mockResolvedValueOnce(parentRecipe)
      ;(updateRecipe as any).mockRejectedValue(new Error('Update failed'))

      // Should still complete deletion even if parent update fails
      await expect(deleteRecipeComplete(mockAgent, recipeUri)).rejects.toThrow()

      // Should still delete from PDS and IndexedDB
      expect(deleteRecipe).toHaveBeenCalled()
      expect(recipeDB.delete).toHaveBeenCalled()
    })

    it('should handle no parent recipes', async () => {
      ;(collectionDB.getAll as any).mockResolvedValue([])
      ;(getParentRecipes as any).mockResolvedValue([])

      await deleteRecipeComplete(mockAgent, recipeUri)

      // Should not update any recipes
      expect(updateRecipe).not.toHaveBeenCalled()

      // Should still delete from PDS and IndexedDB
      expect(deleteRecipe).toHaveBeenCalled()
      expect(recipeDB.delete).toHaveBeenCalled()
    })
  })
})
