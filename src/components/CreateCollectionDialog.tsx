/**
 * Dialog component for creating a new collection
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { useAuth } from '../hooks/useAuth'
import { getAuthenticatedAgent } from '../services/agent'
import { createNewCollection } from '../services/collections'

export interface CreateCollectionDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Callback when collection is successfully created */
  onSuccess?: (uri: string) => void
}

/**
 * Dialog component for creating a new collection
 */
export function CreateCollectionDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateCollectionDialogProps) {
  const { isAuthenticated } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Collection name is required')
      return
    }

    if (!isAuthenticated) {
      setError('You must be authenticated to create collections')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }

      const result = await createNewCollection(
        agent,
        name.trim(),
        description.trim() || undefined,
      )

      // Reset form
      setName('')
      setDescription('')
      setError(null)

      // Call success callback
      if (onSuccess) {
        onSuccess(result.uri)
      }

      // Close dialog
      onOpenChange(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create collection',
      )
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    if (!isCreating) {
      setName('')
      setDescription('')
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogDescription>
              Create a new collection to organize your recipes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="collection-name">Name *</Label>
              <Input
                id="collection-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder="e.g., Desserts"
                required
                disabled={isCreating}
                aria-describedby={error ? 'collection-error' : undefined}
              />
            </div>
            <div>
              <Label htmlFor="collection-description">Description</Label>
              <Textarea
                id="collection-description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setError(null)
                }}
                placeholder="Optional description for this collection"
                disabled={isCreating}
                rows={3}
              />
            </div>
            {error && (
              <div
                className="rounded-md bg-red-50 p-3 text-sm text-red-700"
                role="alert"
                id="collection-error"
              >
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating || !isAuthenticated}>
              {isCreating ? 'Creating...' : 'Create Collection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
