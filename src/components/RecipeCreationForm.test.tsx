import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeCreationForm } from './RecipeCreationForm'
import { AuthProvider } from '../hooks/AuthProvider'
import { ReactNode } from 'react'

// Mock the services
vi.mock('../services/agent', () => ({
  getAuthenticatedAgent: vi.fn(),
}))

vi.mock('../services/atproto', () => ({
  createRecipe: vi.fn(),
}))

vi.mock('../services/indexeddb', () => ({
  recipeDB: {
    put: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../utils/ingredientExtraction', () => ({
  extractIngredients: vi.fn((text: string) => {
    // Simple mock extraction for testing
    const ingredients: any[] = []
    const flourMatch = text.match(/(\d+)\s*g\s+flour/i)
    if (flourMatch) {
      ingredients.push({
        name: 'flour',
        amount: parseFloat(flourMatch[1]),
        unit: 'g',
        byteStart: text.indexOf(flourMatch[0]),
        byteEnd: text.indexOf(flourMatch[0]) + flourMatch[0].length,
      })
    }
    const sugarMatch = text.match(/(\d+)\s*g\s+sugar/i)
    if (sugarMatch) {
      ingredients.push({
        name: 'sugar',
        amount: parseFloat(sugarMatch[1]),
        unit: 'g',
        byteStart: text.indexOf(sugarMatch[0]),
        byteEnd: text.indexOf(sugarMatch[0]) + sugarMatch[0].length,
      })
    }
    return ingredients
  }),
}))

vi.mock('../services/auth', () => ({
  initializeOAuthClient: vi.fn().mockResolvedValue({}),
  startLogin: vi.fn().mockResolvedValue(undefined),
  handleOAuthCallback: vi.fn().mockResolvedValue(null),
  initializeFromStorage: vi.fn().mockResolvedValue(null),
  logout: vi.fn().mockResolvedValue(undefined),
  toAuthSession: vi.fn((session: { did: string; sub: string }) => ({
    did: session.did,
    handle: session.sub,
  })),
  saveAuthState: vi.fn(),
  clearAuthState: vi.fn(),
}))

const agentService = await import('../services/agent')
const atprotoService = await import('../services/atproto')
const indexeddbService = await import('../services/indexeddb')

describe('RecipeCreationForm Component', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  const mockAgent = {
    session: {
      did: 'did:test:123',
      handle: 'test.bsky.social',
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    ;(agentService.getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    ;(atprotoService.createRecipe as any).mockResolvedValue({
      uri: 'at://did:test:123/dev.chrispardy.recipes/abc123',
      cid: 'cid123',
    })
  })

  it('should render form with all fields', async () => {
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/create new recipe/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/servings/i)).toBeInTheDocument()
    expect(screen.getByText(/^steps/i)).toBeInTheDocument()
    expect(screen.getByText(/ingredients.*auto-extracted/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create recipe/i })).toBeInTheDocument()
  })

  it('should allow entering recipe title', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Chocolate Chip Cookies')

    expect(titleInput).toHaveValue('Chocolate Chip Cookies')
  })

  it('should allow entering servings number', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/servings/i)).toBeInTheDocument()
    })

    const servingsInput = screen.getByLabelText(/servings/i)
    await user.clear(servingsInput)
    await user.type(servingsInput, '12')

    expect(servingsInput).toHaveValue(12)
  })

  it('should allow adding multiple steps', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add step/i)).toBeInTheDocument()
    })

    const addStepButton = screen.getByText(/add step/i)
    await user.click(addStepButton)

    const textareas = screen.getAllByRole('textbox')
    const stepTextareas = textareas.filter(
      (textarea) => textarea.getAttribute('placeholder')?.includes('Step')
    )
    expect(stepTextareas.length).toBeGreaterThan(1)
  })

  it('should allow removing steps', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add step/i)).toBeInTheDocument()
    })

    // Add a step first
    const addStepButton = screen.getByText(/add step/i)
    await user.click(addStepButton)

    // Find remove buttons (×)
    const removeButtons = screen.getAllByRole('button', { name: /remove step/i })
    expect(removeButtons.length).toBeGreaterThan(0)

    // Remove a step
    await user.click(removeButtons[0])

    // Should still have at least one step
    const textareas = screen.getAllByRole('textbox')
    const stepTextareas = textareas.filter(
      (textarea) => textarea.getAttribute('placeholder')?.includes('Step')
    )
    expect(stepTextareas.length).toBeGreaterThanOrEqual(1)
  })

  it('should extract ingredients from steps in real-time', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/steps/i)).toBeInTheDocument()
    })

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )

    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix 240g flour and 60g sugar')

      await waitFor(() => {
        expect(screen.getByText(/flour/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/240.*g.*flour/i)).toBeInTheDocument()
      expect(screen.getByText(/60.*g.*sugar/i)).toBeInTheDocument()
    }
  })

  it('should show manual ingredient addition form when clicked', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add manually/i)).toBeInTheDocument()
    })

    const addManualButton = screen.getByText(/add manually/i)
    await user.click(addManualButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/ingredient name/i)).toBeInTheDocument()
    })

    expect(screen.getByLabelText(/amount.*optional/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/unit.*optional/i)).toBeInTheDocument()
  })

  it('should allow adding manual ingredients', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add manually/i)).toBeInTheDocument()
    })

    const addManualButton = screen.getByText(/add manually/i)
    await user.click(addManualButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/ingredient name/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/ingredient name/i)
    await user.type(nameInput, 'vanilla extract')

    const amountInput = screen.getByLabelText(/amount.*optional/i)
    await user.type(amountInput, '1')

    const unitInput = screen.getByLabelText(/unit.*optional/i)
    await user.type(unitInput, 'tsp')

    const addButton = screen.getByRole('button', { name: /add ingredient/i })
    await user.click(addButton)

    await waitFor(() => {
      expect(screen.getByText(/vanilla extract/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/1.*tsp.*vanilla extract/i)).toBeInTheDocument()
    expect(screen.getByText(/manual/i)).toBeInTheDocument()
  })

  it('should show ingredient suggestions when typing manual ingredient name', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add manually/i)).toBeInTheDocument()
    })

    // First, add a step with an ingredient
    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )

    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix 240g flour')
    }

    await waitFor(() => {
      expect(screen.getByText(/flour/i)).toBeInTheDocument()
    })

    // Now open manual ingredient form
    const addManualButton = screen.getByText(/add manually/i)
    await user.click(addManualButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/ingredient name/i)).toBeInTheDocument()
    })

    // Type something similar to existing ingredient
    const nameInput = screen.getByLabelText(/ingredient name/i)
    await user.type(nameInput, 'flo')

    // Should show suggestions
    await waitFor(() => {
      expect(screen.getByText(/suggestions/i)).toBeInTheDocument()
    })
  })

  it('should validate form before submission', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create recipe/i })).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument()
    })
  })

  it('should validate that at least one step is required', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/at least one step is required/i)).toBeInTheDocument()
    })
  })

  it('should validate servings is at least 1', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/servings/i)).toBeInTheDocument()
    })

    const servingsInput = screen.getByLabelText(/servings/i)
    await user.clear(servingsInput)
    await user.type(servingsInput, '0')

    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix ingredients')
    }

    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/servings must be at least 1/i)).toBeInTheDocument()
    })
  })

  it('should submit form and create recipe', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    render(<RecipeCreationForm onSuccess={onSuccess} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Chocolate Chip Cookies')

    const servingsInput = screen.getByLabelText(/servings/i)
    await user.clear(servingsInput)
    await user.type(servingsInput, '12')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix 240g flour and 60g sugar')
    }

    // Submit
    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(atprotoService.createRecipe).toHaveBeenCalled()
    })

    // Check that recipe was created with correct data
    const createRecipeCall = (atprotoService.createRecipe as any).mock.calls[0]
    expect(createRecipeCall[1]).toMatchObject({
      title: 'Chocolate Chip Cookies',
      servings: 12,
      ingredients: expect.arrayContaining([
        expect.objectContaining({ name: 'flour' }),
        expect.objectContaining({ name: 'sugar' }),
      ]),
      steps: expect.arrayContaining([
        expect.objectContaining({ text: 'Mix 240g flour and 60g sugar' }),
      ]),
    })

    // Check IndexedDB was updated
    await waitFor(() => {
      expect(indexeddbService.recipeDB.put).toHaveBeenCalled()
    })

    // Check success callback was called
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    }, { timeout: 2000 })
  })

  it('should show success message after successful creation', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix ingredients')
    }

    // Submit
    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/recipe created successfully/i)).toBeInTheDocument()
    })
  })

  it('should handle errors during submission', async () => {
    const user = userEvent.setup()
    ;(atprotoService.createRecipe as any).mockRejectedValueOnce(new Error('Network error'))

    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix ingredients')
    }

    // Submit
    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it('should handle authentication errors', async () => {
    const user = userEvent.setup()
    ;(agentService.getAuthenticatedAgent as any).mockResolvedValueOnce(null)

    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix ingredients')
    }

    // Submit
    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/must be authenticated/i)).toBeInTheDocument()
    })
  })

  it('should allow removing manual ingredients', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add manually/i)).toBeInTheDocument()
    })

    // Add manual ingredient
    const addManualButton = screen.getByText(/add manually/i)
    await user.click(addManualButton)

    await waitFor(() => {
      expect(screen.getByLabelText(/ingredient name/i)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/ingredient name/i)
    await user.type(nameInput, 'vanilla')

    const addButton = screen.getByRole('button', { name: /add ingredient/i })
    await user.click(addButton)

    await waitFor(() => {
      expect(screen.getByText(/vanilla/i)).toBeInTheDocument()
    })

    // Find and click remove button
    const removeButtons = screen.getAllByRole('button', { name: /remove/i })
    const vanillaRemoveButton = removeButtons.find((btn) =>
      btn.getAttribute('aria-label')?.includes('vanilla')
    )

    if (vanillaRemoveButton) {
      await user.click(vanillaRemoveButton)

      await waitFor(() => {
        expect(screen.queryByText(/vanilla/i)).not.toBeInTheDocument()
      })
    }
  })

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<RecipeCreationForm onCancel={onCancel} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    expect(onCancel).toHaveBeenCalled()
  })

  it('should disable form during submission', async () => {
    const user = userEvent.setup()
    // Make createRecipe take a while
    ;(atprotoService.createRecipe as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ uri: 'test', cid: 'test' }), 100))
    )

    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    })

    // Fill in form
    const titleInput = screen.getByLabelText(/title/i)
    await user.type(titleInput, 'Test Recipe')

    const textareas = screen.getAllByRole('textbox')
    const stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix ingredients')
    }

    // Submit
    const submitButton = screen.getByRole('button', { name: /create recipe/i })
    await user.click(submitButton)

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument()
    })

    // Form should be disabled
    expect(titleInput).toBeDisabled()
  })

  it('should aggregate ingredients from multiple steps', async () => {
    const user = userEvent.setup()
    render(<RecipeCreationForm />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/add step/i)).toBeInTheDocument()
    })

    // Add first step
    const textareas = screen.getAllByRole('textbox')
    let stepTextarea = textareas.find((textarea) =>
      textarea.getAttribute('placeholder')?.includes('Step')
    )
    if (stepTextarea) {
      await user.type(stepTextarea, 'Mix 240g flour')
    }

    // Add second step
    const addStepButton = screen.getByText(/add step/i)
    await user.click(addStepButton)

    await waitFor(() => {
      const newTextareas = screen.getAllByRole('textbox')
      stepTextarea = newTextareas.find((textarea) =>
        textarea.getAttribute('placeholder')?.includes('Step 2')
      )
    })

    if (stepTextarea) {
      await user.type(stepTextarea, 'Add 60g flour')
    }

    // Should show aggregated flour amount
    await waitFor(() => {
      expect(screen.getByText(/300.*g.*flour/i)).toBeInTheDocument()
    })
  })
})
