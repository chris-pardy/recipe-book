/**
 * Wrapper component for editing a recipe
 * Loads the recipe, validates ownership, and passes it to RecipeCreationForm
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getRecipe } from '../services/atproto'
import { getAuthenticatedAgent } from '../services/agent'
import { recipeDB } from '../services/indexeddb'
import { isRecipeOwned } from '../utils/recipeOwnership'
import { isRecipeForked } from '../utils/recipeForking'
import { RecipeCreationForm } from './RecipeCreationForm'
import { Card, CardContent } from './ui/card'
import type { Recipe } from '../types/recipe'

/**
 * Wrapper component that handles loading recipe and ownership validation
 * for the edit route
 */
export function RecipeEditWrapper() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { session, isAuthenticated } = useAuth()
  const [recipe, setRecipe] = useState<(Recipe & { uri: string }) | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Decode the URI from the URL parameter with error handling
  const recipeUri = useMemo(() => {
    if (!id) return null
    try {
      return decodeURIComponent(id)
    } catch (err) {
      console.error('Failed to decode recipe URI:', err)
      return null
    }
  }, [id])

  // Load recipe
  useEffect(() => {
    let mounted = true

    async function loadRecipe() {
      if (!recipeUri) {
        if (mounted) {
          setError('Invalid recipe URI')
          setIsLoading(false)
        }
        return
      }

      if (!isAuthenticated || !session) {
        if (mounted) {
          setError('Must be authenticated to edit recipes')
          setIsLoading(false)
        }
        return
      }

      // Check ownership inside useEffect to ensure fresh values
      const isOwned = isRecipeOwned(recipeUri, session?.did || null)
      if (!isOwned) {
        if (mounted) {
          setError('You can only edit recipes that you own')
          setIsLoading(false)
        }
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        // Try IndexedDB first
        const cachedRecipe = await recipeDB.get(recipeUri)
        if (cachedRecipe && mounted) {
          // Check if recipe is forked (forks cannot be edited)
          if (isRecipeForked(cachedRecipe)) {
            setError('Forked recipes cannot be edited. Only the original owner can edit recipes.')
            setIsLoading(false)
            return
          }
          setRecipe({ ...cachedRecipe, uri: recipeUri })
          setIsLoading(false)
          return
        }

        // If not in cache, fetch from PDS
        const agent = await getAuthenticatedAgent()
        if (!agent) {
          throw new Error('Failed to authenticate')
        }

        const recipeRecord = await getRecipe(agent, recipeUri)
        if (!recipeRecord) {
          throw new Error('Recipe not found')
        }

        if (mounted) {
          const recipeWithUri = { ...recipeRecord, uri: recipeUri }
          // Note: Recipes from PDS won't have forkMetadata, but we already checked
          // the cache earlier (lines 77-84) to catch any forked recipes that were
          // previously cached locally. No need to check again here.
          setRecipe(recipeWithUri)
          // Cache the complete recipe with URI
          await recipeDB.put(recipeUri, recipeWithUri)
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load recipe',
          )
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    loadRecipe()

    return () => {
      mounted = false
    }
  }, [recipeUri, isAuthenticated, session])

  const handleSuccess = (uri: string) => {
    // Navigate to recipe view after successful update
    navigate(`/recipe/${encodeURIComponent(uri)}`, { replace: true })
  }

  const handleCancel = () => {
    if (recipeUri) {
      navigate(`/recipe/${encodeURIComponent(recipeUri)}`, { replace: true })
    } else {
      navigate('/', { replace: true })
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-6">
            <p>Loading recipe...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">
              {error || 'Recipe not found'}
            </p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Home
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <RecipeCreationForm
      recipeUri={recipe.uri}
      initialRecipe={recipe}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
    />
  )
}
