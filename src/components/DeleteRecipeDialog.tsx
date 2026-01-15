/**
 * Dialog component for confirming recipe deletion
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'

export interface DeleteRecipeDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Recipe title to display in confirmation message */
  recipeTitle: string
  /** Callback when deletion is confirmed */
  onConfirm: () => void
  /** Whether deletion is in progress */
  isLoading?: boolean
}

/**
 * Dialog component for confirming recipe deletion
 */
export function DeleteRecipeDialog({
  open,
  onOpenChange,
  recipeTitle,
  onConfirm,
  isLoading = false,
}: DeleteRecipeDialogProps) {
  const handleConfirm = () => {
    onConfirm()
  }

  const handleCancel = () => {
    if (!isLoading) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Recipe</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{recipeTitle}"? This action cannot
            be undone. The recipe will be removed from all collections and
            permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            aria-label="Cancel recipe deletion"
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            aria-label={`Delete recipe ${recipeTitle}`}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
