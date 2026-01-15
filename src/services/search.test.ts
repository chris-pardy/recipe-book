import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  searchByTitle,
  searchByIngredients,
  filterByCollection,
  searchRecipes,
  parseSearchQuery,
  type SearchFilters,
} from './search'
import { recipeDB, collectionDB } from './indexeddb'
import type { Recipe } from '../types/recipe'

// Mock indexeddb service
vi.mock('./indexeddb', () => ({
  recipeDB: {
    getAll: vi.fn(),
    getByCollection: vi.fn(),
  },
  collectionDB: {
    getAll: vi.fn(),
  },
}))

describe('Search Service', () => {
  const mockRecipes: (Recipe & { uri: string })[] = [
    {
      uri: 'at://did:example:123/recipe1',
      title: 'Chocolate Cake',
      servings: 8,
      ingredients: [
        { id: '1', name: 'flour', amount: 200, unit: 'g' },
        { id: '2', name: 'sugar', amount: 150, unit: 'g' },
        { id: '3', name: 'chocolate', amount: 100, unit: 'g' },
      ],
      steps: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      uri: 'at://did:example:123/recipe2',
      title: 'Apple Pie',
      servings: 6,
      ingredients: [
        { id: '4', name: 'apples', amount: 500, unit: 'g' },
        { id: '5', name: 'flour', amount: 300, unit: 'g' },
        { id: '6', name: 'sugar', amount: 100, unit: 'g' },
      ],
      steps: [],
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
    {
      uri: 'at://did:example:123/recipe3',
      title: 'Banana Bread',
      servings: 10,
      ingredients: [
        { id: '7', name: 'bananas', amount: 3, unit: 'piece' },
        { id: '8', name: 'flour', amount: 250, unit: 'g' },
      ],
      steps: [],
      createdAt: '2024-01-03T00:00:00Z',
      updatedAt: '2024-01-03T00:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(recipeDB.getAll as any).mockResolvedValue(mockRecipes)
  })

  describe('searchByTitle', () => {
    it('should return recipes matching title (case-insensitive)', async () => {
      const results = await searchByTitle('chocolate')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })

    it('should return recipes with partial title match', async () => {
      const results = await searchByTitle('apple')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Apple Pie')
    })

    it('should return empty array for no matches', async () => {
      const results = await searchByTitle('pizza')
      expect(results).toHaveLength(0)
    })

    it('should return empty array for empty query', async () => {
      const results = await searchByTitle('')
      expect(results).toHaveLength(0)
    })

    it('should return empty array for whitespace-only query', async () => {
      const results = await searchByTitle('   ')
      expect(results).toHaveLength(0)
    })

    it('should handle case-insensitive search', async () => {
      const results = await searchByTitle('CHOCOLATE')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })
  })

  describe('searchByIngredients', () => {
    it('should return recipes containing any of the specified ingredients', async () => {
      const results = await searchByIngredients(['chocolate'])
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })

    it('should return recipes matching multiple ingredient queries', async () => {
      const results = await searchByIngredients(['flour', 'sugar'])
      expect(results.length).toBeGreaterThan(0)
      // All recipes should match since they all contain flour or sugar
      expect(results.some((r) => r.title === 'Chocolate Cake')).toBe(true)
      expect(results.some((r) => r.title === 'Apple Pie')).toBe(true)
    })

    it('should return empty array for no matches', async () => {
      const results = await searchByIngredients(['tomato'])
      expect(results).toHaveLength(0)
    })

    it('should return empty array for empty ingredient list', async () => {
      const results = await searchByIngredients([])
      expect(results).toHaveLength(0)
    })

    it('should handle case-insensitive ingredient search', async () => {
      const results = await searchByIngredients(['CHOCOLATE'])
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })

    it('should match partial ingredient names', async () => {
      const results = await searchByIngredients(['choco'])
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Chocolate Cake')
    })
  })

  describe('filterByCollection', () => {
    it('should return recipes in the specified collection', async () => {
      const collectionUri = 'at://did:example:123/collection1'
      const collectionRecipes = [mockRecipes[0], mockRecipes[1]]
      ;(recipeDB.getByCollection as any).mockResolvedValue(collectionRecipes)

      const results = await filterByCollection(collectionUri)
      expect(results).toHaveLength(2)
      expect(recipeDB.getByCollection).toHaveBeenCalledWith(collectionUri)
    })

    it('should return empty array for collection with no recipes', async () => {
      const collectionUri = 'at://did:example:123/empty-collection'
      ;(recipeDB.getByCollection as any).mockResolvedValue([])

      const results = await filterByCollection(collectionUri)
      expect(results).toHaveLength(0)
    })
  })

  describe('searchRecipes', () => {
    it('should search by title only', async () => {
      const filters: SearchFilters = { title: 'chocolate' }
      const results = await searchRecipes(filters)
      expect(results).toHaveLength(1)
      expect(results[0].recipe.title).toBe('Chocolate Cake')
      expect(results[0].matchReasons).toContain('title')
    })

    it('should search by ingredients only', async () => {
      const filters: SearchFilters = { ingredients: ['chocolate'] }
      const results = await searchRecipes(filters)
      expect(results).toHaveLength(1)
      expect(results[0].recipe.title).toBe('Chocolate Cake')
      expect(results[0].matchReasons).toContain('ingredients')
    })

    it('should filter by collection only', async () => {
      const collectionUri = 'at://did:example:123/collection1'
      const collectionRecipes = [mockRecipes[0]]
      ;(recipeDB.getByCollection as any).mockResolvedValue(collectionRecipes)

      const filters: SearchFilters = { collectionUri }
      const results = await searchRecipes(filters)
      expect(results).toHaveLength(1)
      expect(results[0].recipe.title).toBe('Chocolate Cake')
      expect(results[0].matchReasons).toContain('collection')
    })

    it('should combine multiple filters', async () => {
      const filters: SearchFilters = {
        title: 'cake',
        ingredients: ['flour'],
      }
      const results = await searchRecipes(filters)
      expect(results.length).toBeGreaterThan(0)
      const cakeResult = results.find((r) => r.recipe.title === 'Chocolate Cake')
      expect(cakeResult).toBeDefined()
      expect(cakeResult?.matchReasons).toContain('title')
      expect(cakeResult?.matchReasons).toContain('ingredients')
    })

    it('should return empty array when no filters provided', async () => {
      const filters: SearchFilters = {}
      const results = await searchRecipes(filters)
      expect(results).toHaveLength(0)
    })

    it('should deduplicate recipes that match multiple criteria', async () => {
      const filters: SearchFilters = {
        title: 'cake',
        ingredients: ['chocolate'],
      }
      const results = await searchRecipes(filters)
      // Should only appear once even though it matches both criteria
      const cakeResults = results.filter((r) => r.recipe.title === 'Chocolate Cake')
      expect(cakeResults).toHaveLength(1)
      expect(cakeResults[0].matchReasons.length).toBeGreaterThan(1)
    })
  })

  describe('parseSearchQuery', () => {
    it('should parse plain text query as title and ingredient search', () => {
      const result = parseSearchQuery('chocolate cake')
      expect(result.title).toBe('chocolate cake')
      expect(result.ingredients).toEqual(['chocolate', 'cake'])
    })

    it('should parse collection filter', () => {
      const result = parseSearchQuery('collection:desserts')
      expect(result.collectionUri).toBe('desserts')
      expect(result.title).toBeUndefined()
      expect(result.ingredients).toBeUndefined()
    })

    it('should parse collection filter with URI', () => {
      const uri = 'at://did:example:123/collection1'
      const result = parseSearchQuery(`collection:${uri}`)
      expect(result.collectionUri).toBe(uri)
    })

    it('should parse ingredient filter', () => {
      const result = parseSearchQuery('ingredient:chocolate')
      expect(result.ingredients).toEqual(['chocolate'])
      expect(result.title).toBeUndefined()
    })

    it('should parse multiple ingredients', () => {
      const result = parseSearchQuery('ingredients:chocolate,flour,sugar')
      expect(result.ingredients).toEqual(['chocolate', 'flour', 'sugar'])
    })

    it('should handle empty query', () => {
      const result = parseSearchQuery('')
      expect(result.title).toBeUndefined()
      expect(result.ingredients).toBeUndefined()
      expect(result.collectionUri).toBeUndefined()
    })

    it('should handle whitespace-only query', () => {
      const result = parseSearchQuery('   ')
      expect(result.title).toBeUndefined()
      expect(result.ingredients).toBeUndefined()
      expect(result.collectionUri).toBeUndefined()
    })

    it('should trim whitespace from parsed values', () => {
      const result = parseSearchQuery('  chocolate cake  ')
      expect(result.title).toBe('chocolate cake')
      expect(result.ingredients).toEqual(['chocolate', 'cake'])
    })

    it('should handle case-insensitive collection filter', () => {
      const result = parseSearchQuery('COLLECTION:desserts')
      expect(result.collectionUri).toBe('desserts')
    })

    it('should handle case-insensitive ingredient filter', () => {
      const result = parseSearchQuery('INGREDIENT:chocolate')
      expect(result.ingredients).toEqual(['chocolate'])
    })
  })
})
