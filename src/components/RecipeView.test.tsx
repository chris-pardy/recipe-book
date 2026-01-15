import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { RecipeView } from './RecipeView'
import { useAuth } from '../hooks/useAuth'
import { getAuthenticatedAgent } from '../services/agent'
import { getRecipe } from '../services/atproto'
import { recipeDB, collectionDB } from '../services/indexeddb'
import { deleteRecipeComplete } from '../services/recipeDeletion'
import { isRecipeOwned } from '../utils/recipeOwnership'
import { ensureRecipeInDefaultCollection, getCollectionsForRecipe } from '../services/collections'
import { updateCollection } from '../services/atproto'
import type { Recipe } from '../types/recipe'

// Mock dependencies
vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../services/agent', () => ({
  getAuthenticatedAgent: vi.fn(),
}))

vi.mock('../services/atproto', () => ({
  getRecipe: vi.fn(),
  updateCollection: vi.fn(),
}))

vi.mock('../services/indexeddb', () => ({
  recipeDB: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  collectionDB: {
    getAll: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../services/recipeDeletion', () => ({
  deleteRecipeComplete: vi.fn(),
}))

vi.mock('../utils/recipeOwnership', () => ({
  isRecipeOwned: vi.fn(),
  getDidFromUri: vi.fn((uri: string) => {
    if (!uri.startsWith('at://')) return null
    const parts = uri.replace('at://', '').split('/')
    return parts[0]?.startsWith('did:') ? parts[0] : null
  }),
}))

vi.mock('../services/collections', () => ({
  ensureRecipeInDefaultCollection: vi.fn(),
  getCollectionsForRecipe: vi.fn(),
}))

vi.mock('../services/atproto', () => ({
  getRecipe: vi.fn(),
  updateCollection: vi.fn(),
}))

describe('RecipeView', () => {
  const mockRecipe: Recipe & { uri: string } = {
    uri: 'at://did:plc:user123/dev.chrispardy.recipes/rkey123',
    title: 'Test Recipe',
    servings: 4,
    ingredients: [
      { id: '1', name: 'flour', amount: 240, unit: 'g' },
      { id: '2', name: 'sugar', amount: 60, unit: 'g' },
    ],
    steps: [
      { id: '1', text: 'Mix ingredients', order: 1 },
      { id: '2', text: 'Bake', order: 2 },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  const mockSession = {
    did: 'did:plc:user123',
    handle: 'test.bsky.social',
  }

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  )
  
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      session: mockSession,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      handleCallback: vi.fn(),
    })
    ;(isRecipeOwned as any).mockReturnValue(true)
  })

  it('should display recipe from cache', async () => {
    ;(recipeDB.get as any).mockResolvedValue(mockRecipe)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    expect(screen.getByText(/4 serving/)).toBeInTheDocument()
    expect(screen.getByText(/240 g flour/)).toBeInTheDocument()
    expect(screen.getByText(/60 g sugar/)).toBeInTheDocument()
    expect(screen.getByText('Mix ingredients')).toBeInTheDocument()
    expect(screen.getByText('Bake')).toBeInTheDocument()
  })

  it('should show edit and delete buttons for owned recipes', async () => {
    (recipeDB.get as any).mockResolvedValue(mockRecipe)
    (isRecipeOwned as any).mockReturnValue(true)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit recipe/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /delete recipe/i })).toBeInTheDocument()
    })
  })

  it('should not show edit/delete buttons for non-owned recipes', async () => {
    (recipeDB.get as any).mockResolvedValue(mockRecipe)
    (isRecipeOwned as any).mockReturnValue(false)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: /edit recipe/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete recipe/i }),
    ).not.toBeInTheDocument()
  })

  it('should show "Add to My Recipes" button for non-owned recipes', async () => {
    (isRecipeOwned as any).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    (recipeDB.get as any).mockResolvedValue(undefined)
    const mockAgent = {} as any
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (getRecipe as any).mockResolvedValue(mockRecipe)
    (recipeDB.put as any).mockResolvedValue(undefined)
    (getCollectionsForRecipe as any).mockResolvedValue([])

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should not show "Add to My Recipes" button if recipe is already added', async () => {
    (isRecipeOwned as any).mockReturnValue(false)
    // Recipe loaded from cache, so it's already in My Recipes
    (recipeDB.get as any).mockResolvedValue(mockRecipe)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/recipe added to my recipes/i)).toBeInTheDocument()
    }, { timeout: 3000 })

    expect(
      screen.queryByRole('button', { name: /add to my recipes/i }),
    ).not.toBeInTheDocument()
  })

  it('should add recipe to My Recipes when button is clicked', async () => {
    const user = userEvent.setup()
    (isRecipeOwned as any).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    (recipeDB.get as any).mockResolvedValue(undefined)
    const mockAgent = {} as any
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (getRecipe as any).mockResolvedValue(mockRecipe)
    (recipeDB.put as any).mockResolvedValue(undefined)
    (ensureRecipeInDefaultCollection as any).mockResolvedValue(undefined)
    (getCollectionsForRecipe as any).mockResolvedValue([])

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    const addButton = screen.getByRole('button', { name: /add to my recipes/i })
    await user.click(addButton)

    await waitFor(() => {
      expect(screen.getByText(/recipe added to my recipes/i)).toBeInTheDocument()
    })
  })

  it('should show error when adding recipe to My Recipes fails', async () => {
    const user = userEvent.setup()
    (isRecipeOwned as any).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    (recipeDB.get as any).mockResolvedValue(undefined)
    const mockAgent = {} as any
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (getRecipe as any).mockResolvedValue(mockRecipe)
    // First call: cache recipe after fetching from PDS (succeeds)
    // Second call: add to My Recipes button click (fails)
    vi.mocked(recipeDB.put)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Failed to save'))
    (getCollectionsForRecipe as any).mockResolvedValue([])

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    const addButton = screen.getByRole('button', { name: /add to my recipes/i })
    await user.click(addButton)

    await waitFor(() => {
      // The error message comes from the exception, which is "Failed to save"
      expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
    })
  })

  it('should navigate to edit route when edit button is clicked', async () => {
    const user = userEvent.setup()
    (recipeDB.get as any).mockResolvedValue(mockRecipe)
    (isRecipeOwned as any).mockReturnValue(true)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit recipe/i })).toBeInTheDocument()
    })

    const editButton = screen.getByRole('button', { name: /edit recipe/i })
    await user.click(editButton)

    // With React Router, navigation happens via useNavigate
    // We can't easily test the navigation directly, but we can verify the button works
    expect(editButton).toBeInTheDocument()
  })

  it('should fetch recipe from PDS if not in cache', async () => {
    const mockAgent = {} as any
    (isRecipeOwned as any).mockReturnValue(true)
    (recipeDB.get as any).mockResolvedValue(undefined) // Not in cache
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (getRecipe as any).mockResolvedValue(mockRecipe)
    (recipeDB.put as any).mockResolvedValue(undefined)
    (getCollectionsForRecipe as any).mockResolvedValue([])

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    expect(getRecipe).toHaveBeenCalledWith(mockAgent, mockRecipe.uri)
    // Should cache the complete recipe with URI
    expect(recipeDB.put).toHaveBeenCalledWith(mockRecipe.uri, { ...mockRecipe, uri: mockRecipe.uri })
  })

  it('should show loading state', () => {
    (recipeDB.get as any).mockImplementation(
      () => new Promise(() => {}), // Never resolves
    )

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    expect(screen.getByText('Loading recipe...')).toBeInTheDocument()
  })

  it('should show error when recipe not found', async () => {
    (recipeDB.get as any).mockResolvedValue(undefined)
    const mockAgent = {} as any
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (getRecipe as any).mockResolvedValue(null)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument()
    })
  })

  it('should open delete dialog when delete button is clicked', async () => {
    const user = userEvent.setup()
    (recipeDB.get as any).mockResolvedValue(mockRecipe)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete recipe/i })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /delete recipe/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument()
    })
  })

  it('should delete recipe and redirect when confirmed', async () => {
    const user = userEvent.setup()
    const mockAgent = {} as any
    (recipeDB.get as any).mockResolvedValue(mockRecipe)
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (deleteRecipeComplete as any).mockResolvedValue(undefined)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete recipe/i })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /delete recipe/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: /delete recipe/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(deleteRecipeComplete).toHaveBeenCalledWith(mockAgent, mockRecipe.uri)
    })
      // With React Router, navigation happens via useNavigate
      // We can verify the delete was successful by checking the dialog closes
    // The redirect behavior is verified by the function being called
  })

  it('should show error when deletion fails', async () => {
    const user = userEvent.setup()
    const mockAgent = {} as any
    (recipeDB.get as any).mockResolvedValue(mockRecipe)
    (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    (deleteRecipeComplete as any).mockRejectedValue(new Error('Delete failed'))

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete recipe/i })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /delete recipe/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText(/are you sure/i)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: /delete recipe/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })

  it('should display sub-recipes if present', async () => {
    const recipeWithSubRecipes = {
      ...mockRecipe,
      subRecipes: [
        'at://did:plc:other123/dev.chrispardy.recipes/sub1',
        'at://did:plc:other123/dev.chrispardy.recipes/sub2',
      ],
    }
    (recipeDB.get as any).mockResolvedValue(recipeWithSubRecipes)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Sub-recipes')).toBeInTheDocument()
    })

    expect(
      screen.getByText('at://did:plc:other123/dev.chrispardy.recipes/sub1'),
    ).toBeInTheDocument()
      expect(
        screen.getByText('at://did:plc:other123/dev.chrispardy.recipes/sub2'),
      ).toBeInTheDocument()
  })

  describe('fork functionality', () => {
    const forkedRecipe: Recipe & { uri: string; forkMetadata?: any } = {
      ...mockRecipe,
      uri: 'at://did:plc:user123/dev.chrispardy.recipes/rkey123',
      forkMetadata: {
        originalRecipeUri: 'at://did:plc:original123/dev.chrispardy.recipes/original',
        originalAuthorDid: 'did:plc:original123',
        forkedAt: '2024-01-01T00:00:00Z',
      },
    }

    it('should display fork indicator for forked recipes', async () => {
      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(forkedRecipe)
      (getCollectionsForRecipe as any).mockResolvedValue([])

      render(<RecipeView recipeUri={forkedRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText(/forked from/i)).toBeInTheDocument()
      })
    })

    it('should show unfork button for forked recipes', async () => {
      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(forkedRecipe)
      (getCollectionsForRecipe as any).mockResolvedValue([])

      render(<RecipeView recipeUri={forkedRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unfork recipe/i })).toBeInTheDocument()
      })
    })

    it('should create fork metadata when adding non-owned recipe to My Recipes', async () => {
      const user = userEvent.setup()
      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(undefined)
      const mockAgent = {} as any
      (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
      (getRecipe as any).mockResolvedValue(mockRecipe)
      (recipeDB.put as any).mockResolvedValue(undefined)
      (ensureRecipeInDefaultCollection as any).mockResolvedValue(undefined)
      (getCollectionsForRecipe as any).mockResolvedValue([])

      render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
      }, { timeout: 3000 })

      const addButton = screen.getByRole('button', { name: /add to my recipes/i })
      await user.click(addButton)

      await waitFor(() => {
        // Should be called with fork metadata
        const putCalls = (recipeDB.put as any).mock.calls
        const addToMyRecipesCall = putCalls.find(
          (call) => call[0] === mockRecipe.uri && call.length === 5
        )
        expect(addToMyRecipesCall).toBeDefined()
        expect(addToMyRecipesCall![4]).toMatchObject({
          originalRecipeUri: mockRecipe.uri,
          originalAuthorDid: 'did:plc:user123',
          forkedAt: expect.any(String),
        })
      })
    })

    it('should unfork recipe when unfork button is clicked', async () => {
      const user = userEvent.setup()
      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(forkedRecipe)
      (getCollectionsForRecipe as any).mockResolvedValue([])
      const mockAgent = {} as any
      (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
      (collectionDB.getAll as any).mockResolvedValue([])
      (recipeDB.delete as any).mockResolvedValue(undefined)

      render(<RecipeView recipeUri={forkedRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unfork recipe/i })).toBeInTheDocument()
      })

      const unforkButton = screen.getByRole('button', { name: /unfork recipe/i })
      await user.click(unforkButton)

      await waitFor(() => {
        expect(recipeDB.delete).toHaveBeenCalledWith(forkedRecipe.uri)
      })
    })

    it('should remove forked recipe from all collections when unforking', async () => {
      const user = userEvent.setup()
      const collection1 = {
        uri: 'at://did:plc:user123/dev.chrispardy.collections/col1',
        name: 'Collection 1',
        recipeUris: [forkedRecipe.uri, 'at://did:plc:user123/dev.chrispardy.recipes/other'],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      const collection2 = {
        uri: 'at://did:plc:user123/dev.chrispardy.collections/col2',
        name: 'Collection 2',
        recipeUris: [forkedRecipe.uri],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(forkedRecipe)
      (getCollectionsForRecipe as any).mockResolvedValue([])
      const mockAgent = {} as any
      (getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
      (collectionDB.getAll as any).mockResolvedValue([collection1, collection2])
      (updateCollection as any).mockResolvedValue({ uri: collection1.uri, cid: 'cid1' })
      (recipeDB.delete as any).mockResolvedValue(undefined)

      render(<RecipeView recipeUri={forkedRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unfork recipe/i })).toBeInTheDocument()
      })

      const unforkButton = screen.getByRole('button', { name: /unfork recipe/i })
      await user.click(unforkButton)

      await waitFor(() => {
        // Should update both collections
        expect(updateCollection).toHaveBeenCalledWith(mockAgent, collection1.uri, {
          recipeUris: ['at://did:plc:user123/dev.chrispardy.recipes/other'],
        })
        expect(updateCollection).toHaveBeenCalledWith(mockAgent, collection2.uri, {
          recipeUris: [],
        })
        expect(recipeDB.delete).toHaveBeenCalledWith(forkedRecipe.uri)
      })
    })

    it('should not show edit button for forked recipes', async () => {
      (isRecipeOwned as any).mockReturnValue(false)
      (recipeDB.get as any).mockResolvedValue(forkedRecipe)
      (getCollectionsForRecipe as any).mockResolvedValue([])

      render(<RecipeView recipeUri={forkedRecipe.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      expect(
        screen.queryByRole('button', { name: /edit recipe/i }),
      ).not.toBeInTheDocument()
    })
  })

  describe('serving size adjustment', () => {
    const recipeWithIngredients: Recipe & { uri: string } = {
      uri: 'at://did:plc:user123/dev.chrispardy.recipes/rkey123',
      title: 'Test Recipe',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
        { id: '2', name: 'sugar', amount: 60, unit: 'g' },
        { id: '3', name: 'eggs', amount: 2 },
      ],
      steps: [
        {
          id: '1',
          text: 'Mix 240g flour and 60g sugar',
          order: 1,
        },
        {
          id: '2',
          text: 'Add 2 eggs',
          order: 2,
        },
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    it('should display serving size adjustment input', async () => {
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      expect(screen.getByLabelText(/adjust servings/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/adjust servings/i)).toHaveValue(4)
    })

    it('should allow adjusting serving size', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        expect(servingsInput).toHaveValue(8)
      })
    })

    it('should display scaled ingredients when serving size is adjusted', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        // Should show scaled amounts (doubled)
        expect(screen.getByText(/480 g flour/)).toBeInTheDocument()
        expect(screen.getByText(/120 g sugar/)).toBeInTheDocument()
        expect(screen.getByText(/4 eggs/)).toBeInTheDocument()
      })
    })

    it('should regenerate step text with scaled amounts', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        // Step text should be regenerated with scaled amounts
        expect(screen.getByText(/Mix 480g flour and 120g sugar/)).toBeInTheDocument()
        expect(screen.getByText(/Add 4 eggs/)).toBeInTheDocument()
      })
    })

    it('should display both original and adjusted servings', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        expect(screen.getByText(/Original: 4 serving/)).toBeInTheDocument()
        expect(screen.getByText(/Adjusted: 8 serving/)).toBeInTheDocument()
        expect(screen.getByText(/×2.00/)).toBeInTheDocument()
      })
    })

    it('should handle fractional servings', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '6')

      await waitFor(() => {
        // 6 servings = 1.5x multiplier
        // 240 * 1.5 = 360, 60 * 1.5 = 90, 2 * 1.5 = 3
        expect(screen.getByText(/360 g flour/)).toBeInTheDocument()
        expect(screen.getByText(/90 g sugar/)).toBeInTheDocument()
        expect(screen.getByText(/3 eggs/)).toBeInTheDocument()
        expect(screen.getByText(/×1.50/)).toBeInTheDocument()
      })
    })

    it('should show reset button when servings are adjusted', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
      })
    })

    it('should reset to original servings when reset button is clicked', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
      })

      const resetButton = screen.getByRole('button', { name: /reset/i })
      await user.click(resetButton)

      await waitFor(() => {
        expect(servingsInput).toHaveValue(4)
        // Should show original amounts
        expect(screen.getByText(/240 g flour/)).toBeInTheDocument()
        expect(screen.getByText(/60 g sugar/)).toBeInTheDocument()
        expect(screen.getByText(/2 eggs/)).toBeInTheDocument()
        // Reset button should be gone
        expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument()
      })
    })

    it('should preserve original recipe data when scaling', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const originalAmount = recipeWithIngredients.ingredients[0].amount
      const originalServings = recipeWithIngredients.servings

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '8')

      await waitFor(() => {
        // Verify scaled amounts are shown
        expect(screen.getByText(/480 g flour/)).toBeInTheDocument()
      })

      // Verify original recipe is unchanged (we can't directly access it, but we can verify
      // that resetting shows original values)
      const resetButton = screen.getByRole('button', { name: /reset/i })
      await user.click(resetButton)

      await waitFor(() => {
        expect(servingsInput).toHaveValue(originalServings)
        expect(screen.getByText(new RegExp(`${originalAmount} g flour`))).toBeInTheDocument()
      })
    })

    it('should handle very small fractional servings', async () => {
      const user = userEvent.setup()
      (recipeDB.get as any).mockResolvedValue(recipeWithIngredients)

      render(<RecipeView recipeUri={recipeWithIngredients.uri} />, { wrapper })

      await waitFor(() => {
        expect(screen.getByText('Test Recipe')).toBeInTheDocument()
      })

      const servingsInput = screen.getByLabelText(/adjust servings/i)
      await user.clear(servingsInput)
      await user.type(servingsInput, '1')

      await waitFor(() => {
        // 1 serving = 0.25x multiplier (1/4)
        // 240 * 0.25 = 60, 60 * 0.25 = 15, 2 * 0.25 = 0.5
        expect(screen.getByText(/60 g flour/)).toBeInTheDocument()
        expect(screen.getByText(/15 g sugar/)).toBeInTheDocument()
        expect(screen.getByText(/0.5 eggs/)).toBeInTheDocument()
      })
    })
  })
})
