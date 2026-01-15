/**
 * Home page component
 * Displays collections if they exist, otherwise displays all user's recipes
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { collectionDB } from '../services/indexeddb'
import { recipeDB } from '../services/indexeddb'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import type { Collection } from '../types/collection'
import type { Recipe } from '../types/recipe'

export function Home() {
  const { isAuthenticated } = useAuth()
  const [collections, setCollections] = useState<(Collection & { uri: string })[]>([])
  const [recipes, setRecipes] = useState<(Recipe & { uri: string })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!isAuthenticated) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Load collections first
        const allCollections = await collectionDB.getAll()
        setCollections(allCollections)

        // If no collections, load all recipes
        if (allCollections.length === 0) {
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
  }, [isAuthenticated])

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

  // Show collections if they exist
  if (collections.length > 0) {
    return (
      <div className="container mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Collections</h1>
          <p className="text-gray-600 mt-1">
            Your recipe collections
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <Card key={collection.uri} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>
                  <span className="text-gray-900">
                    {collection.name}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {collection.description && (
                  <p className="text-sm text-gray-600 mb-2">
                    {collection.description}
                  </p>
                )}
                <p className="text-sm text-gray-500">
                  {collection.recipeUris.length} recipe
                  {collection.recipeUris.length !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Show all recipes if no collections
  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Recipes</h1>
        <p className="text-gray-600 mt-1">
          Your recipe collection
        </p>
      </div>
      {recipes.length === 0 ? (
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
          {recipes.map((recipe) => (
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
