/**
 * Dialog component for confirming collection deletion
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

export interface DeleteCollectionDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void
  /** Collection name to display in confirmation message */
  collectionName: string
  /** Callback when deletion is confirmed */
  onConfirm: () => void
  /** Whether deletion is in progress */
  isLoading?: boolean
}

/**
 * Dialog component for confirming collection deletion
 */
export function DeleteCollectionDialog({
  open,
  onOpenChange,
  collectionName,
  onConfirm,
  isLoading = false,
}: DeleteCollectionDialogProps) {
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
          <DialogTitle>Delete Collection</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{collectionName}"? This action
            cannot be undone. The collection will be removed, but recipes in the
            collection will not be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            aria-label="Cancel collection deletion"
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            aria-label={`Delete collection ${collectionName}`}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
