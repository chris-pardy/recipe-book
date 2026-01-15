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
  updateRecipe: vi.fn(),
}))

vi.mock('../services/indexeddb', () => ({
  recipeDB: {
    put: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  },
  collectionDB: {
    getAll: vi.fn().mockResolvedValue([]),
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

vi.mock('../utils/subRecipeValidation', () => ({
  wouldCreateCircularReference: vi.fn().mockResolvedValue(false),
}))

const agentService = await import('../services/agent')
const atprotoService = await import('../services/atproto')
const indexeddbService = await import('../services/indexeddb')
const subRecipeValidationService = await import('../utils/subRecipeValidation')

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

  describe('Edit Mode', () => {
    const mockInitialRecipe: Recipe = {
      title: 'Original Recipe',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
        { id: '2', name: 'sugar', amount: 60, unit: 'g' },
      ],
      steps: [
        { id: '1', text: 'Mix 240g flour and 60g sugar', order: 0 },
        { id: '2', text: 'Bake at 350F', order: 1 },
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const mockRecipeUri = 'at://did:test:123/dev.chrispardy.recipes/abc123'

    beforeEach(() => {
      ;(atprotoService.updateRecipe as any).mockResolvedValue({
        uri: mockRecipeUri,
        cid: 'cid123',
      })
    })

    it('should pre-populate form with initial recipe data', async () => {
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByText(/edit recipe/i)).toBeInTheDocument()
      })

      expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      expect(screen.getByDisplayValue('4')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Mix 240g flour and 60g sugar')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Bake at 350F')).toBeInTheDocument()
    })

    it('should show "Edit Recipe" title in edit mode', async () => {
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByText(/edit recipe/i)).toBeInTheDocument()
      })
    })

    it('should show "Update Recipe" button in edit mode', async () => {
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /update recipe/i })).toBeInTheDocument()
      })
    })

    it('should update recipe when form is submitted in edit mode', async () => {
      const user = userEvent.setup()
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      })

      // Modify the title
      const titleInput = screen.getByDisplayValue('Original Recipe')
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated Recipe')

      // Submit
      const submitButton = screen.getByRole('button', { name: /update recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(atprotoService.updateRecipe).toHaveBeenCalledWith(
          mockAgent,
          mockRecipeUri,
          expect.objectContaining({
            title: 'Updated Recipe',
            servings: 4,
          }),
        )
      })
    })

    it('should update IndexedDB cache after successful update', async () => {
      const user = userEvent.setup()
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /update recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(indexeddbService.recipeDB.put).toHaveBeenCalled()
      })

      const putCall = (indexeddbService.recipeDB.put as any).mock.calls[0]
      expect(putCall[0]).toBe(mockRecipeUri)
      expect(putCall[1]).toMatchObject({
        title: 'Original Recipe',
        servings: 4,
      })
      expect(putCall[1].updatedAt).toBeDefined()
    })

    it('should show success message after successful update', async () => {
      const user = userEvent.setup()
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /update recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/recipe updated successfully/i)).toBeInTheDocument()
      })
    })

    it('should re-extract ingredients when steps are modified', async () => {
      const user = userEvent.setup()
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Mix 240g flour and 60g sugar')).toBeInTheDocument()
      })

      // Modify a step to add a new ingredient
      const stepTextarea = screen.getByDisplayValue('Mix 240g flour and 60g sugar')
      await user.clear(stepTextarea)
      await user.type(stepTextarea, 'Mix 240g flour, 60g sugar, and 2 eggs')

      // Wait for ingredient extraction
      await waitFor(() => {
        expect(screen.getByText(/egg/i)).toBeInTheDocument()
      }, { timeout: 2000 })
    })

    it('should handle errors during update', async () => {
      const user = userEvent.setup()
      ;(atprotoService.updateRecipe as any).mockRejectedValueOnce(new Error('Update failed'))

      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /update recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/update failed/i)).toBeInTheDocument()
      })
    })

    it('should preserve createdAt when updating', async () => {
      const user = userEvent.setup()
      render(
        <RecipeCreationForm
          recipeUri={mockRecipeUri}
          initialRecipe={mockInitialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('Original Recipe')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: /update recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(indexeddbService.recipeDB.put).toHaveBeenCalled()
      })

      const putCall = (indexeddbService.recipeDB.put as any).mock.calls[0]
      expect(putCall[1].createdAt).toBe('2024-01-01T00:00:00Z')
      expect(putCall[1].updatedAt).not.toBe('2024-01-01T00:00:00Z')
    })
  })

  describe('Sub-recipes', () => {
    beforeEach(() => {
      // Mock available recipes for sub-recipe selection
      const mockRecipes = [
        {
          uri: 'at://did:test:123/dev.chrispardy.recipes/sub1',
          title: 'Sub Recipe 1',
          servings: 4,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          uri: 'at://did:test:123/dev.chrispardy.recipes/sub2',
          title: 'Sub Recipe 2',
          servings: 6,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]
      ;(indexeddbService.recipeDB.getAll as any).mockResolvedValue(mockRecipes)
      ;(indexeddbService.recipeDB.get as any).mockImplementation((uri: string) => {
        return Promise.resolve(mockRecipes.find(r => r.uri === uri) || null)
      })
    })

    it('should show sub-recipe selector when "Add Sub-recipe" is clicked', async () => {
      const user = userEvent.setup()
      render(<RecipeCreationForm />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText(/add sub-recipe/i)).toBeInTheDocument()
      })

      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })
    })

    it('should search for recipes when typing in sub-recipe search', async () => {
      const user = userEvent.setup()
      render(<RecipeCreationForm />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText(/add sub-recipe/i)).toBeInTheDocument()
      })

      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByLabelText(/search recipes/i)
      await user.type(searchInput, 'Sub Recipe')

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })
    })

    it('should add sub-recipe when clicking on search result', async () => {
      const user = userEvent.setup()
      render(<RecipeCreationForm />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText(/add sub-recipe/i)).toBeInTheDocument()
      })

      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByLabelText(/search recipes/i)
      await user.type(searchInput, 'Sub Recipe')

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })

      const subRecipeButton = screen.getByText(/sub recipe 1/i)
      await user.click(subRecipeButton)

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })

      // Should show sub-recipe in the list
      expect(screen.getByText(/4 serving/i)).toBeInTheDocument()
    })

    it('should prevent adding sub-recipe if it would create circular reference', async () => {
      const user = userEvent.setup()
      ;(subRecipeValidationService.wouldCreateCircularReference as any).mockResolvedValueOnce(true)

      render(<RecipeCreationForm />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText(/add sub-recipe/i)).toBeInTheDocument()
      })

      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByLabelText(/search recipes/i)
      await user.type(searchInput, 'Sub Recipe')

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })

      const subRecipeButton = screen.getByText(/sub recipe 1/i)
      await user.click(subRecipeButton)

      await waitFor(() => {
        expect(screen.getByText(/circular reference/i)).toBeInTheDocument()
      })
    })

    it('should remove sub-recipe when remove button is clicked', async () => {
      const user = userEvent.setup()
      const initialRecipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [{ id: '1', text: 'Mix ingredients', order: 0 }],
        subRecipes: ['at://did:test:123/dev.chrispardy.recipes/sub1'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      render(
        <RecipeCreationForm
          recipeUri="at://did:test:123/dev.chrispardy.recipes/parent"
          initialRecipe={initialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })

      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      const subRecipeRemoveButton = removeButtons.find((btn) =>
        btn.getAttribute('aria-label')?.includes('sub-recipe')
      )

      if (subRecipeRemoveButton) {
        await user.click(subRecipeRemoveButton)

        await waitFor(() => {
          expect(screen.queryByText(/sub recipe 1/i)).not.toBeInTheDocument()
        })
      }
    })

    it('should include sub-recipes in recipe data when submitting', async () => {
      const user = userEvent.setup()
      render(<RecipeCreationForm />, { wrapper })

      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      })

      // Fill in basic form
      const titleInput = screen.getByLabelText(/title/i)
      await user.type(titleInput, 'Test Recipe')

      const textareas = screen.getAllByRole('textbox')
      const stepTextarea = textareas.find((textarea) =>
        textarea.getAttribute('placeholder')?.includes('Step')
      )
      if (stepTextarea) {
        await user.type(stepTextarea, 'Mix ingredients')
      }

      // Add sub-recipe
      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByLabelText(/search recipes/i)
      await user.type(searchInput, 'Sub Recipe')

      await waitFor(() => {
        expect(screen.getByText(/sub recipe 1/i)).toBeInTheDocument()
      })

      const subRecipeButton = screen.getByText(/sub recipe 1/i)
      await user.click(subRecipeButton)

      // Submit
      const submitButton = screen.getByRole('button', { name: /create recipe/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(atprotoService.createRecipe).toHaveBeenCalled()
      })

      const createRecipeCall = (atprotoService.createRecipe as any).mock.calls[0]
      expect(createRecipeCall[1].subRecipes).toEqual([
        'at://did:test:123/dev.chrispardy.recipes/sub1',
      ])
    })

    it('should exclude current recipe from sub-recipe search results', async () => {
      const user = userEvent.setup()
      const initialRecipe = {
        title: 'Current Recipe',
        servings: 4,
        ingredients: [],
        steps: [{ id: '1', text: 'Mix ingredients', order: 0 }],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      render(
        <RecipeCreationForm
          recipeUri="at://did:test:123/dev.chrispardy.recipes/current"
          initialRecipe={initialRecipe}
        />,
        { wrapper },
      )

      await waitFor(() => {
        expect(screen.getByText(/add sub-recipe/i)).toBeInTheDocument()
      })

      const addSubRecipeButton = screen.getByText(/add sub-recipe/i)
      await user.click(addSubRecipeButton)

      await waitFor(() => {
        expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
      })

      const searchInput = screen.getByLabelText(/search recipes/i)
      await user.type(searchInput, 'Recipe')

      // Should not show current recipe in results
      await waitFor(() => {
        const results = screen.queryAllByText(/current recipe/i)
        expect(results.length).toBe(0)
      })
    })
  })
})
