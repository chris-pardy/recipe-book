/**
 * Home page component
 * Displays collections if they exist, otherwise displays all user's recipes
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { collectionDB } from '../services/indexeddb'
import { recipeDB } from '../services/indexeddb'
import { getAuthenticatedAgent } from '../services/agent'
import { deleteCollectionComplete } from '../services/collections'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { CreateCollectionDialog } from './CreateCollectionDialog'
import { DeleteCollectionDialog } from './DeleteCollectionDialog'
import { RecipeSearch, HighlightedText, type SearchResult } from './RecipeSearch'
import { extractSearchTerms } from '../utils/searchHighlight'
import type { Collection } from '../types/collection'
import type { Recipe } from '../types/recipe'

export function Home() {
  const { isAuthenticated } = useAuth()
  const [collections, setCollections] = useState<(Collection & { uri: string })[]>([])
  const [recipes, setRecipes] = useState<(Recipe & { uri: string })[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearchActive, setIsSearchActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCollectionUri, setSelectedCollectionUri] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deleteCollectionUri, setDeleteCollectionUri] = useState<string | null>(null)
  const [deleteCollectionName, setDeleteCollectionName] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!isAuthenticated) {
        setIsLoading(false)
        return
      }

      // Don't load recipes if search is active - search results will be shown instead
      if (isSearchActive) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Load collections first
        const allCollections = await collectionDB.getAll()
        setCollections(allCollections)

        // Load recipes based on selected collection
        if (selectedCollectionUri) {
          const collectionRecipes = await recipeDB.getByCollection(selectedCollectionUri)
          setRecipes(collectionRecipes)
        } else {
          // Show all recipes if no collection selected
          const allRecipes = await recipeDB.getAll()
          setRecipes(allRecipes)
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load data'
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [isAuthenticated, selectedCollectionUri, isSearchActive])

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <h1 className="text-2xl font-bold mb-4">Welcome to Recipe Book</h1>
            <p className="text-gray-600 mb-4">
              Sign in to view your recipes and collections
            </p>
            <Link
              to="/login"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p>Loading...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleCreateCollectionSuccess = async () => {
    // Reload collections
    const allCollections = await collectionDB.getAll()
    setCollections(allCollections)
  }

  const handleDeleteCollection = async () => {
    if (!deleteCollectionUri) return

    setIsDeleting(true)
    setError(null)

    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }

      await deleteCollectionComplete(agent, deleteCollectionUri)

      // Reload collections
      const allCollections = await collectionDB.getAll()
      setCollections(allCollections)

      // Clear selection if deleted collection was selected
      if (selectedCollectionUri === deleteCollectionUri) {
        setSelectedCollectionUri(null)
      }

      setDeleteCollectionUri(null)
      setDeleteCollectionName(null)
      setIsDeleting(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete collection'
      )
      setIsDeleting(false)
    }
  }

  const handleSearchResultsChange = (results: SearchResult[]) => {
    setSearchResults(results)
  }

  const handleSearchActiveChange = (isActive: boolean) => {
    setIsSearchActive(isActive)
  }

  const handleSearchChange = (searching: boolean) => {
    // Update loading state based on search status
    if (searching) {
      setIsLoading(true)
    } else {
      setIsLoading(false)
    }
  }

  const selectedCollection = selectedCollectionUri
    ? collections.find((c) => c.uri === selectedCollectionUri)
    : null

  // Determine which recipes to display
  const displayRecipes = isSearchActive
    ? searchResults.map((result) => result.recipe)
    : recipes

  // Show collections if they exist
  if (collections.length > 0 || selectedCollectionUri) {
    return (
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <RecipeSearch
            onResultsChange={handleSearchResultsChange}
            onSearchChange={handleSearchChange}
            onSearchActiveChange={handleSearchActiveChange}
            onSearchQueryChange={setSearchQuery}
            className="mb-6"
          />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isSearchActive
                ? `Search Results (${searchResults.length})`
                : selectedCollection
                  ? selectedCollection.name
                  : 'Collections'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isSearchActive
                ? `Found ${searchResults.length} recipe${searchResults.length !== 1 ? 's' : ''}`
                : selectedCollection
                  ? `${selectedCollection.recipeUris.length} recipe${selectedCollection.recipeUris.length !== 1 ? 's' : ''}`
                  : 'Your recipe collections'}
            </p>
          </div>
          <div className="flex gap-2">
            {selectedCollectionUri && !isSearchActive && (
              <Button
                variant="outline"
                onClick={() => setSelectedCollectionUri(null)}
              >
                Back to Collections
              </Button>
            )}
            {!isSearchActive && (
              <Button onClick={() => setShowCreateDialog(true)}>
                Create Collection
              </Button>
            )}
          </div>
        </div>

        {isSearchActive ? (
          // Show search results
          searchResults.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-gray-600 mb-4">
                  No recipes found matching your search criteria
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Try adjusting your search terms or filters
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((result) => {
                const searchTerms = extractSearchTerms(searchQuery)
                return (
                  <Card key={result.recipe.uri} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle>
                        <Link
                          to={`/recipe/${encodeURIComponent(result.recipe.uri)}`}
                          className="hover:text-blue-600 transition-colors"
                        >
                          <HighlightedText text={result.recipe.title} searchTerms={searchTerms} />
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500 mb-2">
                        {result.recipe.servings} serving{result.recipe.servings !== 1 ? 's' : ''}
                      </p>
                      {result.matchReasons.length > 0 && (
                        <p className="text-xs text-gray-400">
                          Matched by: {result.matchReasons.join(', ')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        ) : selectedCollectionUri ? (
          // Show recipes in selected collection
          displayRecipes.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-gray-600 mb-4">
                  No recipes in this collection yet
                </p>
                <Link
                  to="/create"
                  className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Create Recipe
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayRecipes.map((recipe) => (
                <Card key={recipe.uri} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>
                      <Link
                        to={`/recipe/${encodeURIComponent(recipe.uri)}`}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {recipe.title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500">
                      {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          // Show collections list
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((collection) => (
              <Card
                key={collection.uri}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedCollectionUri(collection.uri)}
              >
                <CardHeader>
                  <CardTitle>
                    <span className="text-gray-900">{collection.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {collection.description && (
                    <p className="text-sm text-gray-600 mb-2">
                      {collection.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {collection.recipeUris.length} recipe
                      {collection.recipeUris.length !== 1 ? 's' : ''}
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteCollectionUri(collection.uri)
                        setDeleteCollectionName(collection.name)
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <CreateCollectionDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSuccess={handleCreateCollectionSuccess}
        />

        {deleteCollectionUri && deleteCollectionName && (
          <DeleteCollectionDialog
            open={!!deleteCollectionUri}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteCollectionUri(null)
                setDeleteCollectionName(null)
              }
            }}
            collectionName={deleteCollectionName}
            onConfirm={handleDeleteCollection}
            isLoading={isDeleting}
          />
        )}
      </div>
    )
  }

  // Show all recipes if no collections
  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <RecipeSearch
          onResultsChange={handleSearchResultsChange}
          onSearchChange={handleSearchChange}
          onSearchActiveChange={handleSearchActiveChange}
          onSearchQueryChange={setSearchQuery}
          className="mb-6"
        />
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isSearchActive
            ? `Search Results (${searchResults.length})`
            : 'All Recipes'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isSearchActive
            ? `Found ${searchResults.length} recipe${searchResults.length !== 1 ? 's' : ''}`
            : 'Your recipe collection'}
        </p>
      </div>

      {isSearchActive ? (
        searchResults.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-gray-600 mb-4">
                No recipes found matching your search criteria
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Try adjusting your search terms or filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map((result) => {
              const searchTerms = extractSearchTerms(searchQuery)
              return (
                <Card key={result.recipe.uri} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle>
                      <Link
                        to={`/recipe/${encodeURIComponent(result.recipe.uri)}`}
                        className="hover:text-blue-600 transition-colors"
                      >
                        <HighlightedText text={result.recipe.title} searchTerms={searchTerms} />
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-500 mb-2">
                      {result.recipe.servings} serving{result.recipe.servings !== 1 ? 's' : ''}
                    </p>
                    {result.matchReasons.length > 0 && (
                      <p className="text-xs text-gray-400">
                        Matched by: {result.matchReasons.join(', ')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
      ) : displayRecipes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-gray-600 mb-4">No recipes yet</p>
            <Link
              to="/create"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Create Your First Recipe
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayRecipes.map((recipe) => (
            <Card key={recipe.uri} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>
                  <Link
                    to={`/recipe/${encodeURIComponent(recipe.uri)}`}
                    className="hover:text-blue-600 transition-colors"
                  >
                    {recipe.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
