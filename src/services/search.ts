/**
 * Search service for recipes in IndexedDB cache
 * Provides efficient searching by title, ingredients, and collections
 */

import { recipeDB, collectionDB } from './indexeddb'
import type { Recipe } from '../types/recipe'
import type { Collection } from '../types/collection'

export interface SearchFilters {
  title?: string
  ingredients?: string[]
  collectionUri?: string
}

export interface SearchResult {
  recipe: Recipe & { uri: string }
  matchReasons: string[]
}

/**
 * Search recipes by title (partial match, case-insensitive)
 */
export async function searchByTitle(
  query: string,
): Promise<(Recipe & { uri: string })[]> {
  if (!query.trim()) {
    return []
  }

  const allRecipes = await recipeDB.getAll()
  const lowerQuery = query.toLowerCase().trim()

  return allRecipes.filter((recipe) =>
    recipe.title.toLowerCase().includes(lowerQuery),
  )
}

/**
 * Search recipes by ingredient names (partial match, case-insensitive)
 */
export async function searchByIngredients(
  ingredientQueries: string[],
): Promise<(Recipe & { uri: string })[]> {
  if (ingredientQueries.length === 0) {
    return []
  }

  const allRecipes = await recipeDB.getAll()
  const lowerQueries = ingredientQueries.map((q) => q.toLowerCase().trim())

  return allRecipes.filter((recipe) => {
    const recipeIngredientNames = recipe.ingredients.map((ing) =>
      ing.name.toLowerCase(),
    )
    return lowerQueries.some((query) =>
      recipeIngredientNames.some((name) => name.includes(query)),
    )
  })
}

/**
 * Filter recipes by collection
 * Accepts either a collection URI or collection name
 */
export async function filterByCollection(
  collectionIdentifier: string,
): Promise<(Recipe & { uri: string })[]> {
  // Check if it's already a URI (starts with "at://")
  if (collectionIdentifier.startsWith('at://')) {
    return await recipeDB.getByCollection(collectionIdentifier)
  }

  // Otherwise, treat it as a name and find the collection by name
  const allCollections = await collectionDB.getAll()
  const collection = allCollections.find(
    (c) => c.name.toLowerCase() === collectionIdentifier.toLowerCase()
  )

  if (!collection) {
    // Collection not found, return empty array
    return []
  }

  return await recipeDB.getByCollection(collection.uri)
}

/**
 * Comprehensive search that combines multiple filters
 * 
 * Search behavior:
 * - Title and ingredient filters use OR logic (matches any)
 * - Collection filter uses AND logic when combined with title/ingredient filters
 *   (recipes must match search terms AND be in the collection)
 * - When only collection filter is provided, returns all recipes in that collection
 */
export async function searchRecipes(
  filters: SearchFilters,
): Promise<SearchResult[]> {
  // If no filters provided, return empty array
  if (!filters.title && !filters.ingredients?.length && !filters.collectionUri) {
    return []
  }

  const hasCollectionFilter = !!filters.collectionUri
  const hasSearchFilters = !!(filters.title || filters.ingredients?.length)

  // If collection filter is combined with search filters, use AND logic
  if (hasCollectionFilter && hasSearchFilters) {
    // First, get recipes matching title/ingredients (OR logic)
    const searchResults: Map<string, SearchResult> = new Map()

    // Search by title
    if (filters.title) {
      const titleMatches = await searchByTitle(filters.title)
      for (const recipe of titleMatches) {
        const existing = searchResults.get(recipe.uri)
        if (existing) {
          existing.matchReasons.push('title')
        } else {
          searchResults.set(recipe.uri, {
            recipe,
            matchReasons: ['title'],
          })
        }
      }
    }

    // Search by ingredients
    if (filters.ingredients && filters.ingredients.length > 0) {
      const ingredientMatches = await searchByIngredients(filters.ingredients)
      for (const recipe of ingredientMatches) {
        const existing = searchResults.get(recipe.uri)
        if (existing) {
          if (!existing.matchReasons.includes('ingredients')) {
            existing.matchReasons.push('ingredients')
          }
        } else {
          searchResults.set(recipe.uri, {
            recipe,
            matchReasons: ['ingredients'],
          })
        }
      }
    }

    // Then filter by collection (AND logic)
    // filterByCollection handles both URI and name resolution
    const collectionRecipes = await filterByCollection(filters.collectionUri!)
    const collectionUriSet = new Set(collectionRecipes.map((r) => r.uri))

    // Return only recipes that match search AND are in collection
    return Array.from(searchResults.values()).filter((result) => {
      if (collectionUriSet.has(result.recipe.uri)) {
        if (!result.matchReasons.includes('collection')) {
          result.matchReasons.push('collection')
        }
        return true
      }
      return false
    })
  }

  // Otherwise, use OR logic (matches any filter)
  const results: Map<string, SearchResult> = new Map()

  // Search by title
  if (filters.title) {
    const titleMatches = await searchByTitle(filters.title)
    for (const recipe of titleMatches) {
      const existing = results.get(recipe.uri)
      if (existing) {
        existing.matchReasons.push('title')
      } else {
        results.set(recipe.uri, {
          recipe,
          matchReasons: ['title'],
        })
      }
    }
  }

  // Search by ingredients
  if (filters.ingredients && filters.ingredients.length > 0) {
    const ingredientMatches = await searchByIngredients(filters.ingredients)
    for (const recipe of ingredientMatches) {
      const existing = results.get(recipe.uri)
      if (existing) {
        if (!existing.matchReasons.includes('ingredients')) {
          existing.matchReasons.push('ingredients')
        }
      } else {
        results.set(recipe.uri, {
          recipe,
          matchReasons: ['ingredients'],
        })
      }
    }
  }

  // Filter by collection (when used alone)
  if (filters.collectionUri) {
    const collectionMatches = await filterByCollection(filters.collectionUri)
    for (const recipe of collectionMatches) {
      const existing = results.get(recipe.uri)
      if (existing) {
        if (!existing.matchReasons.includes('collection')) {
          existing.matchReasons.push('collection')
        }
      } else {
        results.set(recipe.uri, {
          recipe,
          matchReasons: ['collection'],
        })
      }
    }
  }

  return Array.from(results.values())
}

/**
 * Parse a search query string into search filters
 * Supports:
 * - Plain text: searches title and ingredients
 * - Collection filter: "collection:<name>" or "collection:<uri>"
 * - Ingredient filter: "ingredient:<name>" or multiple ingredients separated by commas
 * 
 * Note: Collection names will be resolved to URIs asynchronously in the search function.
 * This function returns the collection identifier (name or URI) as-is.
 */
export function parseSearchQuery(query: string): SearchFilters {
  const filters: SearchFilters = {}
  const trimmedQuery = query.trim()

  // Return empty filters for empty or whitespace-only queries
  if (trimmedQuery.length === 0) {
    return filters
  }

  // Check for collection filter: "collection:name" or "collection:uri" (case-insensitive)
  const collectionMatch = trimmedQuery.match(/^collection:(.+)$/i)
  if (collectionMatch) {
    const collectionValue = collectionMatch[1].trim()
    if (collectionValue.length > 0) {
      // Store as-is - will be resolved to URI in searchRecipes if needed
      filters.collectionUri = collectionValue
    }
    return filters
  }

  // Check for ingredient filter: "ingredient:name" or "ingredients:name1,name2" (case-insensitive)
  const ingredientMatch = trimmedQuery.match(/^ingredient[s]?:(.+)$/i)
  if (ingredientMatch) {
    const ingredientList = ingredientMatch[1]
      .split(',')
      .map((ing) => ing.trim())
      .filter((ing) => ing.length > 0)
    if (ingredientList.length > 0) {
      filters.ingredients = ingredientList
    }
    return filters
  }

  // Default: search by title and ingredients
  // Split by spaces and treat each word as a potential ingredient
  const words = trimmedQuery.split(/\s+/).filter((word) => word.length > 0)
  
  // Use the trimmed query for title search
  filters.title = trimmedQuery
  
  // Use individual words for ingredient search
  if (words.length > 0) {
    filters.ingredients = words
  }

  return filters
}
