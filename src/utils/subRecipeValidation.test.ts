/**
 * Tests for sub-recipe validation utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { wouldCreateCircularReference, getParentRecipes } from './subRecipeValidation'
import { recipeDB } from '../services/indexeddb'
import type { Recipe } from '../types/recipe'

vi.mock('../services/indexeddb', () => ({
  recipeDB: {
    get: vi.fn(),
    getAll: vi.fn(),
  },
}))

describe('subRecipeValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('wouldCreateCircularReference', () => {
    it('should return true if trying to add self as sub-recipe', async () => {
      const result = await wouldCreateCircularReference(
        'at://did:example:recipe1',
        'at://did:example:recipe1',
      )
      expect(result).toBe(true)
    })

    it('should return false if no circular reference exists', async () => {
      const parentUri = 'at://did:example:recipe1'
      const subRecipeUri = 'at://did:example:recipe2'

      // Mock recipeDB.get to return a recipe with no sub-recipes
      ;(recipeDB.get as any).mockResolvedValueOnce({
        uri: subRecipeUri,
        title: 'Sub Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Recipe & { uri: string })

      const result = await wouldCreateCircularReference(parentUri, subRecipeUri)
      expect(result).toBe(false)
    })

    it('should return true if sub-recipe directly references parent', async () => {
      const parentUri = 'at://did:example:recipe1'
      const subRecipeUri = 'at://did:example:recipe2'

      // Mock sub-recipe that has parent as its sub-recipe
      ;(recipeDB.get as any).mockResolvedValueOnce({
        uri: subRecipeUri,
        title: 'Sub Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        subRecipes: [parentUri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Recipe & { uri: string })

      const result = await wouldCreateCircularReference(parentUri, subRecipeUri)
      expect(result).toBe(true)
    })

    it('should return true if sub-recipe indirectly references parent through nested sub-recipes', async () => {
      const parentUri = 'at://did:example:recipe1'
      const subRecipeUri = 'at://did:example:recipe2'
      const nestedSubRecipeUri = 'at://did:example:recipe3'

      // Mock nested sub-recipe that has parent as its sub-recipe
      ;(recipeDB.get as any)
        .mockResolvedValueOnce({
          uri: nestedSubRecipeUri,
          title: 'Nested Sub Recipe',
          servings: 4,
          ingredients: [],
          steps: [],
          subRecipes: [parentUri],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        } as Recipe & { uri: string })
        .mockResolvedValueOnce({
          uri: subRecipeUri,
          title: 'Sub Recipe',
          servings: 4,
          ingredients: [],
          steps: [],
          subRecipes: [nestedSubRecipeUri],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        } as Recipe & { uri: string })

      const result = await wouldCreateCircularReference(parentUri, subRecipeUri)
      expect(result).toBe(true)
    })

    it('should handle missing recipes gracefully', async () => {
      const parentUri = 'at://did:example:recipe1'
      const subRecipeUri = 'at://did:example:recipe2'

      // Mock recipeDB.get to return null (recipe not found)
      ;(recipeDB.get as any).mockResolvedValueOnce(null)

      const result = await wouldCreateCircularReference(parentUri, subRecipeUri)
      expect(result).toBe(false)
    })
  })

  describe('getParentRecipes', () => {
    it('should return empty array if no parents exist', async () => {
      const recipeUri = 'at://did:example:recipe1'

      ;(recipeDB.getAll as any).mockResolvedValueOnce([
        {
          uri: 'at://did:example:recipe2',
          title: 'Recipe 2',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ] as (Recipe & { uri: string })[])

      const result = await getParentRecipes(recipeUri)
      expect(result).toEqual([])
    })

    it('should return parent recipe URIs', async () => {
      const recipeUri = 'at://did:example:recipe1'

      ;(recipeDB.getAll as any).mockResolvedValueOnce([
        {
          uri: 'at://did:example:recipe2',
          title: 'Recipe 2',
          servings: 4,
          ingredients: [],
          steps: [],
          subRecipes: [recipeUri],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:example:recipe3',
          title: 'Recipe 3',
          servings: 4,
          ingredients: [],
          steps: [],
          subRecipes: [recipeUri],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:example:recipe4',
          title: 'Recipe 4',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ] as (Recipe & { uri: string })[])

      const result = await getParentRecipes(recipeUri)
      expect(result).toEqual([
        'at://did:example:recipe2',
        'at://did:example:recipe3',
      ])
    })

    it('should handle recipes without subRecipes field', async () => {
      const recipeUri = 'at://did:example:recipe1'

      ;(recipeDB.getAll as any).mockResolvedValueOnce([
        {
          uri: 'at://did:example:recipe2',
          title: 'Recipe 2',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ] as (Recipe & { uri: string })[])

      const result = await getParentRecipes(recipeUri)
      expect(result).toEqual([])
    })
  })
})
