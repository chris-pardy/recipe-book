/**
 * Component for viewing a recipe with delete and edit functionality for owned recipes,
 * and "Add to My Recipes" functionality for non-owned recipes
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getRecipe } from '../services/atproto'
import { getAuthenticatedAgent } from '../services/agent'
import { recipeDB } from '../services/indexeddb'
import { deleteRecipeComplete } from '../services/recipeDeletion'
import { isRecipeOwned } from '../utils/recipeOwnership'
import { DeleteRecipeDialog } from './DeleteRecipeDialog'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import type { Recipe } from '../types/recipe'

export interface RecipeViewProps {
  /** The URI of the recipe to display */
  recipeUri: string
}

/**
 * Component for viewing a recipe
 * Shows edit/delete buttons for recipes owned by the current user
 * Shows "Add to My Recipes" button for non-owned recipes
 */
export function RecipeView({ recipeUri }: RecipeViewProps) {
  const navigate = useNavigate()
  const { session, isAuthenticated } = useAuth()
  const [recipe, setRecipe] = useState<(Recipe & { uri: string }) | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isAddingToMyRecipes, setIsAddingToMyRecipes] = useState(false)
  const [isAddedToMyRecipes, setIsAddedToMyRecipes] = useState(false)
  const [addToMyRecipesError, setAddToMyRecipesError] = useState<string | null>(null)

  const isOwned = isRecipeOwned(recipeUri, session?.did || null)

  // Load recipe from IndexedDB first, then from PDS if needed
  useEffect(() => {
    let mounted = true

    async function loadRecipe() {
      try {
        setIsLoading(true)
        setError(null)

        // Try IndexedDB first
        const cachedRecipe = await recipeDB.get(recipeUri)
        if (cachedRecipe && mounted) {
          setRecipe(cachedRecipe)
          setIsLoading(false)
          // If loaded from cache and not owned, it's already in My Recipes
          if (!isOwned) {
            setIsAddedToMyRecipes(true)
          }
          return
        }

        // If not in cache, fetch from PDS
        if (!isAuthenticated || !session) {
          throw new Error('Must be authenticated to view recipes')
        }

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

  const handleDeleteClick = () => {
    setShowDeleteDialog(true)
    setDeleteError(null)
  }

  const handleDeleteConfirm = async () => {
    if (!isAuthenticated || !session) {
      setDeleteError('Must be authenticated to delete recipes')
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }

      await deleteRecipeComplete(agent, recipeUri)

      // Redirect to home after successful deletion
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete recipe',
      )
      setIsDeleting(false)
    }
  }

  const handleEditClick = () => {
    // Navigate to edit route (will be implemented in issue #10)
    navigate(`/recipe/${encodeURIComponent(recipeUri)}/edit`)
  }

  const handleAddToMyRecipes = async () => {
    if (!recipe) {
      return
    }

    setIsAddingToMyRecipes(true)
    setAddToMyRecipesError(null)

    try {
      // Save recipe to IndexedDB (this adds it to the user's local collection)
      // When collections are fully implemented (issue #12), this can be enhanced
      // to add the recipe to a default "My Saved Recipes" collection
      // Ensure consistency by always including the URI
      await recipeDB.put(recipeUri, { ...recipe, uri: recipeUri })
      setIsAddedToMyRecipes(true)
    } catch (err) {
      setAddToMyRecipesError(
        err instanceof Error ? err.message : 'Failed to add recipe to My Recipes',
      )
    } finally {
      setIsAddingToMyRecipes(false)
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
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{recipe.title}</CardTitle>
            <div className="flex gap-2">
              {isOwned ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleEditClick}
                  >
                    Edit Recipe
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                  >
                    Delete Recipe
                  </Button>
                </>
              ) : (
                !isAddedToMyRecipes && (
                  <Button
                    onClick={handleAddToMyRecipes}
                    disabled={isAddingToMyRecipes || !isAuthenticated}
                  >
                    {isAddingToMyRecipes ? 'Adding...' : 'Add to My Recipes'}
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Servings</h3>
              <p>{recipe.servings}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Ingredients</h3>
              <ul className="list-disc list-inside">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>
                    {ingredient.amount && ingredient.unit
                      ? `${ingredient.amount} ${ingredient.unit} ${ingredient.name}`
                      : ingredient.name}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Steps</h3>
              <ol className="list-decimal list-inside space-y-2">
                {recipe.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <li key={step.id}>{step.text}</li>
                  ))}
              </ol>
            </div>

            {recipe.subRecipes && recipe.subRecipes.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Sub-recipes</h3>
                <ul className="list-disc list-inside">
                  {recipe.subRecipes.map((subRecipeUri) => (
                    <li key={subRecipeUri}>
                      <Link
                        to={`/recipe/${encodeURIComponent(subRecipeUri)}`}
                        className="text-primary hover:underline"
                      >
                        {subRecipeUri}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {deleteError && (
              <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded">
                {deleteError}
              </div>
            )}

            {addToMyRecipesError && (
              <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded">
                {addToMyRecipesError}
              </div>
            )}

            {isAddedToMyRecipes && !isOwned && (
              <div className="mt-4 p-4 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 rounded">
                Recipe added to My Recipes
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <DeleteRecipeDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        recipeTitle={recipe.title}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </div>
  )
}
