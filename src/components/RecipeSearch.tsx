/**
 * Recipe Search Component
 * Provides search interface with debouncing and filtering options
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { searchRecipes, parseSearchQuery, type SearchFilters } from '../services/search'
import { collectionDB } from '../services/indexeddb'
import { highlightText, extractSearchTerms } from '../utils/searchHighlight'
import type { Recipe } from '../types/recipe'
import type { Collection } from '../types/collection'

export interface SearchResult {
  recipe: Recipe & { uri: string }
  matchReasons: string[]
}

export interface RecipeSearchProps {
  onResultsChange: (results: SearchResult[]) => void
  onSearchChange?: (isSearching: boolean) => void
  onSearchActiveChange?: (isActive: boolean) => void
  className?: string
}

const DEBOUNCE_DELAY = 300 // milliseconds

export function RecipeSearch({
  onResultsChange,
  onSearchChange,
  onSearchActiveChange,
  className,
}: RecipeSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCollectionUri, setSelectedCollectionUri] = useState<string | null>(null)
  const [collections, setCollections] = useState<(Collection & { uri: string })[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load collections on mount
  useEffect(() => {
    async function loadCollections() {
      try {
        const allCollections = await collectionDB.getAll()
        setCollections(allCollections)
      } catch (err) {
        console.error('Failed to load collections:', err)
      }
    }
    loadCollections()
  }, [])

  // Perform search with debouncing
  const performSearch = useCallback(async (query: string, collectionUri: string | null) => {
    const hasQuery = query.trim().length > 0
    const hasCollectionFilter = collectionUri !== null
    
    // Determine if search is active
    const isActive = hasQuery || hasCollectionFilter
    onSearchActiveChange?.(isActive)

    // If no search criteria, clear results and return
    if (!isActive) {
      onResultsChange([])
      return
    }

    setIsSearching(true)
    setError(null)
    onSearchChange?.(true)

    try {
      const filters: SearchFilters = {}

      // Parse query for title/ingredient search
      if (hasQuery) {
        const parsed = parseSearchQuery(query)
        if (parsed.title) {
          filters.title = parsed.title
        }
        if (parsed.ingredients && parsed.ingredients.length > 0) {
          filters.ingredients = parsed.ingredients
        }
        // If parsed query has collectionUri, use that instead of selectedCollectionUri
        if (parsed.collectionUri) {
          filters.collectionUri = parsed.collectionUri
        } else if (hasCollectionFilter) {
          filters.collectionUri = collectionUri
        }
      } else if (hasCollectionFilter) {
        // If only collection filter is selected
        filters.collectionUri = collectionUri
      }

      const results = await searchRecipes(filters)
      onResultsChange(results)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to search recipes'
      )
      onResultsChange([])
    } finally {
      setIsSearching(false)
      onSearchChange?.(false)
    }
  }, [onResultsChange, onSearchChange, onSearchActiveChange])

  // Debounce search
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      performSearch(searchQuery, selectedCollectionUri)
    }, DEBOUNCE_DELAY)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery, selectedCollectionUri, performSearch])

  const handleClear = useCallback(() => {
    setSearchQuery('')
    setSelectedCollectionUri(null)
    onResultsChange([])
  }, [onResultsChange])

  const hasActiveSearch = searchQuery.trim().length > 0 || selectedCollectionUri !== null

  return (
    <div className={className}>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search-query">Search Recipes</Label>
            <div className="flex gap-2">
              <Input
                id="search-query"
                type="text"
                placeholder="Search by title or ingredients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              {hasActiveSearch && (
                <Button
                  variant="outline"
                  onClick={handleClear}
                  type="button"
                >
                  Clear
                </Button>
              )}
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          {collections.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="collection-filter">Filter by Collection (optional)</Label>
              <select
                id="collection-filter"
                value={selectedCollectionUri || ''}
                onChange={(e) => setSelectedCollectionUri(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Collections</option>
                {collections.map((collection) => (
                  <option key={collection.uri} value={collection.uri}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isSearching && (
            <p className="text-sm text-gray-500">Searching...</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Component to render highlighted text
 */
export function HighlightedText({
  text,
  searchTerms,
  className,
}: {
  text: string
  searchTerms: string[]
  className?: string
}) {
  const segments = useMemo(
    () => highlightText(text, searchTerms),
    [text, searchTerms]
  )

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.highlighted ? (
          <mark key={index} className="bg-yellow-200 font-semibold">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  )
}
