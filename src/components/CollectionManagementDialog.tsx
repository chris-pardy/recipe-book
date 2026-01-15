/**
 * Dialog component for managing which collections a recipe belongs to
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { useAuth } from '../hooks/useAuth'
import { getAuthenticatedAgent } from '../services/agent'
import { collectionDB } from '../services/indexeddb'
import {
  addRecipeToCollection,
  removeRecipeFromCollection,
  getCollectionsForRecipe,
} from '../services/collections'
import type { Collection } from '../types/collection'

export interface CollectionManagementDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Recipe URI to manage collections for */
  recipeUri: string
  /** Callback when collections are updated */
  onUpdate?: () => void
}

/**
 * Dialog component for managing which collections a recipe belongs to
 */
export function CollectionManagementDialog({
  open,
  onOpenChange,
  recipeUri,
  onUpdate,
}: CollectionManagementDialogProps) {
  const { isAuthenticated } = useAuth()
  const [collections, setCollections] = useState<
    (Collection & { uri: string })[]
  >([])
  const [recipeCollections, setRecipeCollections] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load collections and recipe's collections
  useEffect(() => {
    if (!open || !isAuthenticated) {
      return
    }

    let cancelled = false

    async function loadData() {
      try {
        setIsLoading(true)
        setError(null)

        // Load all collections
        const allCollections = await collectionDB.getAll()
        if (!cancelled) {
          setCollections(allCollections)
        }

        // Load collections for this recipe
        const recipeCols = await getCollectionsForRecipe(recipeUri)
        if (!cancelled) {
          setRecipeCollections(recipeCols.map((c) => c.uri))
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load collections',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [open, isAuthenticated, recipeUri])

  const handleToggleCollection = async (collectionUri: string) => {
    if (!isAuthenticated) {
      setError('You must be authenticated to manage collections')
      return
    }

    setIsUpdating(true)
    setError(null)

    // Capture current state before async operation
    const isInCollection = recipeCollections.includes(collectionUri)

    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }

      if (isInCollection) {
        await removeRecipeFromCollection(agent, collectionUri, recipeUri)
      } else {
        await addRecipeToCollection(agent, collectionUri, recipeUri)
      }

      // Update local state optimistically
      setRecipeCollections((prev) =>
        isInCollection
          ? prev.filter((uri) => uri !== collectionUri)
          : [...prev, collectionUri],
      )

      // Call update callback
      if (onUpdate) {
        onUpdate()
      }
    } catch (err) {
      // Revert optimistic update on error
      // Use the captured isInCollection value to determine revert direction
      setRecipeCollections((prev) => {
        if (isInCollection) {
          // Was removed optimistically, add it back
          if (!prev.includes(collectionUri)) {
            return [...prev, collectionUri]
          }
        } else {
          // Was added optimistically, remove it
          return prev.filter((uri) => uri !== collectionUri)
        }
        return prev
      })
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update collection',
      )
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Collections</DialogTitle>
            <DialogDescription>Loading collections...</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Collections</DialogTitle>
          <DialogDescription>
            Select which collections this recipe belongs to
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4 max-h-96 overflow-y-auto">
          {collections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No collections yet. Create a collection to organize your recipes.
            </p>
          ) : (
            collections.map((collection) => {
              const isInCollection = recipeCollections.includes(collection.uri)
              return (
                <div
                  key={collection.uri}
                  className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm">{collection.name}</div>
                    {collection.description && (
                      <div className="text-xs text-gray-500 mt-1">
                        {collection.description}
                      </div>
                    )}
                  </div>
                  <Button
                    variant={isInCollection ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggleCollection(collection.uri)}
                    disabled={isUpdating}
                    aria-label={
                      isInCollection
                        ? `Remove from ${collection.name}`
                        : `Add to ${collection.name}`
                    }
                  >
                    {isInCollection ? 'Remove' : 'Add'}
                  </Button>
                </div>
              )
            })
          )}
        </div>
        {error && (
          <div
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
