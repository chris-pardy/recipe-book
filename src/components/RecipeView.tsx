/**
 * Component for viewing a recipe with delete and edit functionality for owned recipes,
 * and "Add to My Recipes" functionality for non-owned recipes
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getRecipe } from '../services/atproto'
import { getAuthenticatedAgent } from '../services/agent'
import { recipeDB, collectionDB } from '../services/indexeddb'
import { deleteRecipeComplete } from '../services/recipeDeletion'
import { isRecipeOwned } from '../utils/recipeOwnership'
import { ensureRecipeInDefaultCollection } from '../services/collections'
import { getCollectionsForRecipe } from '../services/collections'
import { createForkMetadata, isRecipeForked, getForkMetadata } from '../utils/recipeForking'
import { updateCollection } from '../services/atproto'
import { DeleteRecipeDialog } from './DeleteRecipeDialog'
import { CollectionManagementDialog } from './CollectionManagementDialog'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { scaleRecipe, type ScaledRecipe } from '../utils/recipeScaling'
import type { Recipe } from '../types/recipe'
import type { Collection } from '../types/collection'

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
  const [collections, setCollections] = useState<(Collection & { uri: string })[]>([])
  const [showCollectionDialog, setShowCollectionDialog] = useState(false)
  const [isUnforking, setIsUnforking] = useState(false)
  const [unforkError, setUnforkError] = useState<string | null>(null)
  const [subRecipePreviews, setSubRecipePreviews] = useState<Map<string, Recipe & { uri: string }>>(new Map())
  const [isLoadingSubRecipes, setIsLoadingSubRecipes] = useState(false)
  const [adjustedServings, setAdjustedServings] = useState<number | null>(null)
  const [scaledRecipe, setScaledRecipe] = useState<ScaledRecipe | null>(null)

  const isOwned = isRecipeOwned(recipeUri, session?.did || null)
  const isForked = isRecipeForked(recipe)
  const forkMetadata = getForkMetadata(recipe)

  // Update scaled recipe when recipe or adjusted servings change
  useEffect(() => {
    if (!recipe) {
      setScaledRecipe(null)
      return
    }

    if (adjustedServings === null || adjustedServings === recipe.servings) {
      setScaledRecipe(null)
      return
    }

    try {
      const scaled = scaleRecipe(recipe, adjustedServings)
      setScaledRecipe(scaled)
    } catch (error) {
      console.error('Failed to scale recipe:', error)
      setScaledRecipe(null)
    }
  }, [recipe, adjustedServings])

  // Reset adjusted servings when recipe changes
  useEffect(() => {
    setAdjustedServings(null)
    setScaledRecipe(null)
  }, [recipeUri])

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
          
          // Load collections for this recipe
          const recipeCollections = await getCollectionsForRecipe(recipeUri)
          setCollections(recipeCollections)
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
  }, [recipeUri, isAuthenticated, session, isOwned])

  // Load sub-recipe previews
  useEffect(() => {
    async function loadSubRecipePreviews() {
      if (!recipe || !recipe.subRecipes || recipe.subRecipes.length === 0) {
        setSubRecipePreviews(new Map())
        return
      }

      setIsLoadingSubRecipes(true)
      const previews = new Map<string, Recipe & { uri: string }>()

      for (const uri of recipe.subRecipes) {
        try {
          // Try IndexedDB first
          let subRecipe = await recipeDB.get(uri)
          
          // If not in cache, try to fetch from PDS
          if (!subRecipe && isAuthenticated && session) {
            try {
              const agent = await getAuthenticatedAgent()
              if (agent) {
                const recipeRecord = await getRecipe(agent, uri)
                if (recipeRecord) {
                  subRecipe = { ...recipeRecord, uri }
                  await recipeDB.put(uri, subRecipe)
                }
              }
            } catch (err) {
              console.error(`Failed to fetch sub-recipe ${uri}:`, err)
            }
          }

          if (subRecipe) {
            previews.set(uri, subRecipe)
          }
        } catch (err) {
          console.error(`Failed to load sub-recipe ${uri}:`, err)
        }
      }

      setSubRecipePreviews(previews)
      setIsLoadingSubRecipes(false)
    }

    loadSubRecipePreviews()
  }, [recipe, isAuthenticated, session])

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
      // Create fork metadata for this non-owned recipe
      const forkMetadata = createForkMetadata(recipeUri)
      
      // Save recipe to IndexedDB with fork metadata (this adds it to the user's local collection)
      // Ensure consistency by explicitly setting the URI (recipeDB.put will overwrite recipe.uri anyway)
      await recipeDB.put(recipeUri, { ...recipe, uri: recipeUri }, undefined, false, forkMetadata)
      
      // Add to default collection
      await ensureRecipeInDefaultCollection(recipeUri)
      
      // Reload collections
      const recipeCollections = await getCollectionsForRecipe(recipeUri)
      setCollections(recipeCollections)
      
      setIsAddedToMyRecipes(true)
    } catch (err) {
      setAddToMyRecipesError(
        err instanceof Error ? err.message : 'Failed to add recipe to My Recipes',
      )
    } finally {
      setIsAddingToMyRecipes(false)
    }
  }

  const handleCollectionUpdate = async () => {
    // Reload collections
    const recipeCollections = await getCollectionsForRecipe(recipeUri)
    setCollections(recipeCollections)
  }

  const handleUnfork = async () => {
    if (!isAuthenticated || !session || !isForked) {
      return
    }

    setIsUnforking(true)
    setUnforkError(null)

    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }

      // Remove from all collections
      const allCollections = await collectionDB.getAll()
      const collectionsToUpdate = allCollections.filter((collection) =>
        collection.recipeUris.includes(recipeUri),
      )

      const failedCollections: string[] = []
      for (const collection of collectionsToUpdate) {
        try {
          const updatedRecipeUris = collection.recipeUris.filter(
            (uri) => uri !== recipeUri,
          )
          
          // Update in PDS
          const result = await updateCollection(agent, collection.uri, {
            recipeUris: updatedRecipeUris,
          })
          
          // Update in IndexedDB
          await collectionDB.put(collection.uri, {
            ...collection,
            recipeUris: updatedRecipeUris,
          }, result.cid)
        } catch (error) {
          const collectionName = collection.name || collection.uri
          failedCollections.push(collectionName)
          console.error(`Failed to update collection ${collection.uri}:`, error)
          // Continue with other collections even if one fails
        }
      }

      // Log warning if any collection updates failed, but continue with deletion
      if (failedCollections.length > 0) {
        console.warn(
          `Failed to remove recipe from some collections: ${failedCollections.join(', ')}. ` +
          'The recipe will still be removed from your local collection.'
        )
      }

      // Delete from IndexedDB
      await recipeDB.delete(recipeUri)

      // Redirect to home after successful unfork
      navigate('/', { replace: true })
    } catch (err) {
      setUnforkError(
        err instanceof Error ? err.message : 'Failed to unfork recipe',
      )
      setIsUnforking(false)
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
            <div className="flex-1">
              <CardTitle>{recipe.title}</CardTitle>
              {isForked && forkMetadata && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    Forked from{' '}
                    <Link
                      to={`/recipe/${encodeURIComponent(forkMetadata.originalRecipeUri)}`}
                      className="ml-1 underline hover:no-underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      original recipe
                    </Link>
                  </span>
                </div>
              )}
            </div>
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
              ) : isForked ? (
                <Button
                  variant="outline"
                  onClick={handleUnfork}
                  disabled={isUnforking || !isAuthenticated}
                >
                  {isUnforking ? 'Unforking...' : 'Unfork Recipe'}
                </Button>
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
            {/* Serving Size Adjustment */}
            <div>
              <h3 className="font-semibold mb-2">Servings</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Label htmlFor="servings-input" className="min-w-[100px]">
                    Adjust servings:
                  </Label>
                  <Input
                    id="servings-input"
                    type="number"
                    min="0.25"
                    max="100"
                    step="0.25"
                    value={adjustedServings ?? recipe.servings}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value)
                      if (!isNaN(value) && value > 0) {
                        setAdjustedServings(value)
                      } else {
                        setAdjustedServings(null)
                      }
                    }}
                    className="w-24"
                  />
                  {adjustedServings !== null && adjustedServings !== recipe.servings && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAdjustedServings(null)}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                {scaledRecipe && (
                  <p className="text-sm text-muted-foreground">
                    Original: {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''} • 
                    Adjusted: {scaledRecipe.adjustedServings} serving{scaledRecipe.adjustedServings !== 1 ? 's' : ''} 
                    (×{scaledRecipe.multiplier.toFixed(2)})
                  </p>
                )}
                {!scaledRecipe && (
                  <p>{recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Ingredients</h3>
              <ul className="list-disc list-inside">
                {(scaledRecipe?.ingredients || recipe.ingredients).map((ingredient) => (
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
                {(scaledRecipe?.steps || recipe.steps)
                  .sort((a, b) => a.order - b.order)
                  .map((step) => (
                    <li key={step.id}>{step.text}</li>
                  ))}
              </ol>
            </div>

            {recipe.subRecipes && recipe.subRecipes.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Sub-recipes</h3>
                {isLoadingSubRecipes ? (
                  <p className="text-sm text-gray-500">Loading sub-recipes...</p>
                ) : (
                  <div className="space-y-2">
                    {recipe.subRecipes.map((subRecipeUri) => {
                      const preview = subRecipePreviews.get(subRecipeUri)
                      return (
                        <Card key={subRecipeUri} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <Link
                                  to={`/recipe/${encodeURIComponent(subRecipeUri)}`}
                                  className="text-primary hover:underline font-medium"
                                >
                                  {preview ? preview.title : subRecipeUri}
                                </Link>
                                {preview && (
                                  <div className="mt-1 text-sm text-gray-500">
                                    {preview.servings} serving{preview.servings !== 1 ? 's' : ''}
                                    {preview.ingredients && preview.ingredients.length > 0 && (
                                      <span className="ml-2">
                                        • {preview.ingredients.length} ingredient{preview.ingredients.length !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
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

            {unforkError && (
              <div className="mt-4 p-4 bg-destructive/10 text-destructive rounded">
                {unforkError}
              </div>
            )}

            {isAddedToMyRecipes && !isOwned && !isForked && (
              <div className="mt-4 p-4 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 rounded">
                Recipe added to My Recipes
              </div>
            )}

            {/* Collections */}
            {collections && collections.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Collections</h3>
                <div className="flex flex-wrap gap-2">
                  {collections.map((collection) => (
                    <span
                      key={collection.uri}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {collection.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Collection management button */}
            {isAuthenticated && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => setShowCollectionDialog(true)}
                >
                  Manage Collections
                </Button>
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

      <CollectionManagementDialog
        open={showCollectionDialog}
        onOpenChange={setShowCollectionDialog}
        recipeUri={recipeUri}
        onUpdate={handleCollectionUpdate}
      />
    </div>
  )
}
