import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteRecipeDialog } from './DeleteRecipeDialog'

describe('DeleteRecipeDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    recipeTitle: 'Test Recipe',
    onConfirm: vi.fn(),
    isLoading: false,
  }

  it('should render dialog when open', () => {
    render(<DeleteRecipeDialog {...defaultProps} />)
    expect(screen.getByText('Delete Recipe')).toBeInTheDocument()
    expect(
      screen.getByText(/Are you sure you want to delete "Test Recipe"/),
    ).toBeInTheDocument()
  })

  it('should not render when closed', () => {
    render(<DeleteRecipeDialog {...defaultProps} open={false} />)
    expect(screen.queryByText('Delete Recipe')).not.toBeInTheDocument()
  })

  it('should call onConfirm when delete button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<DeleteRecipeDialog {...defaultProps} onConfirm={onConfirm} />)

    const deleteButton = screen.getByRole('button', { name: /delete/i })
    await user.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('should call onOpenChange when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<DeleteRecipeDialog {...defaultProps} onOpenChange={onOpenChange} />)

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should disable buttons when loading', () => {
    render(<DeleteRecipeDialog {...defaultProps} isLoading={true} />)

    const deleteButton = screen.getByRole('button', { name: /deleting/i })
    const cancelButton = screen.getByRole('button', { name: /cancel/i })

    expect(deleteButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()
  })

  it('should show loading text when deleting', () => {
    render(<DeleteRecipeDialog {...defaultProps} isLoading={true} />)
    expect(screen.getByText('Deleting...')).toBeInTheDocument()
  })

  it('should not call onOpenChange when cancel is clicked during loading', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <DeleteRecipeDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        isLoading={true}
      />,
    )

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    // Should not call onOpenChange when loading
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
