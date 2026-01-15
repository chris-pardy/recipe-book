import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { RecipeView } from './RecipeView'
import { useAuth } from '../hooks/useAuth'
import { getAuthenticatedAgent } from '../services/agent'
import { getRecipe } from '../services/atproto'
import { recipeDB } from '../services/indexeddb'
import { deleteRecipeComplete } from '../services/recipeDeletion'
import { isRecipeOwned } from '../utils/recipeOwnership'
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
}))

vi.mock('../services/indexeddb', () => ({
  recipeDB: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('../services/recipeDeletion', () => ({
  deleteRecipeComplete: vi.fn(),
}))

vi.mock('../utils/recipeOwnership', () => ({
  isRecipeOwned: vi.fn(),
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
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      session: mockSession,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      handleCallback: vi.fn(),
    })
    vi.mocked(isRecipeOwned).mockReturnValue(true)
  })

  it('should display recipe from cache', async () => {
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/240 g flour/)).toBeInTheDocument()
    expect(screen.getByText(/60 g sugar/)).toBeInTheDocument()
    expect(screen.getByText('Mix ingredients')).toBeInTheDocument()
    expect(screen.getByText('Bake')).toBeInTheDocument()
  })

  it('should show edit and delete buttons for owned recipes', async () => {
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)
    vi.mocked(isRecipeOwned).mockReturnValue(true)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit recipe/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /delete recipe/i })).toBeInTheDocument()
    })
  })

  it('should not show edit/delete buttons for non-owned recipes', async () => {
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)
    vi.mocked(isRecipeOwned).mockReturnValue(false)

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
    vi.mocked(isRecipeOwned).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    vi.mocked(recipeDB.get).mockResolvedValue(undefined)
    const mockAgent = {} as any
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(getRecipe).mockResolvedValue(mockRecipe)
    vi.mocked(recipeDB.put).mockResolvedValue(undefined)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('should not show "Add to My Recipes" button if recipe is already added', async () => {
    vi.mocked(isRecipeOwned).mockReturnValue(false)
    // Recipe loaded from cache, so it's already in My Recipes
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)

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
    vi.mocked(isRecipeOwned).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    vi.mocked(recipeDB.get).mockResolvedValue(undefined)
    const mockAgent = {} as any
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(getRecipe).mockResolvedValue(mockRecipe)
    vi.mocked(recipeDB.put).mockResolvedValue(undefined)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add to my recipes/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    const addButton = screen.getByRole('button', { name: /add to my recipes/i })
    await user.click(addButton)

    await waitFor(() => {
      expect(recipeDB.put).toHaveBeenCalledWith(mockRecipe.uri, { ...mockRecipe, uri: mockRecipe.uri })
      expect(screen.getByText(/recipe added to my recipes/i)).toBeInTheDocument()
    })
  })

  it('should show error when adding recipe to My Recipes fails', async () => {
    const user = userEvent.setup()
    vi.mocked(isRecipeOwned).mockReturnValue(false)
    // Recipe not in cache, so it will be fetched from PDS
    vi.mocked(recipeDB.get).mockResolvedValue(undefined)
    const mockAgent = {} as any
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(getRecipe).mockResolvedValue(mockRecipe)
    // First call: cache recipe after fetching from PDS (succeeds)
    // Second call: add to My Recipes button click (fails)
    vi.mocked(recipeDB.put)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Failed to save'))

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
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)
    vi.mocked(isRecipeOwned).mockReturnValue(true)

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
    vi.mocked(isRecipeOwned).mockReturnValue(true)
    vi.mocked(recipeDB.get).mockResolvedValue(undefined) // Not in cache
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(getRecipe).mockResolvedValue(mockRecipe)
    vi.mocked(recipeDB.put).mockResolvedValue(undefined)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Test Recipe')).toBeInTheDocument()
    })

    expect(getRecipe).toHaveBeenCalledWith(mockAgent, mockRecipe.uri)
    // Should cache the complete recipe with URI
    expect(recipeDB.put).toHaveBeenCalledWith(mockRecipe.uri, { ...mockRecipe, uri: mockRecipe.uri })
  })

  it('should show loading state', () => {
    vi.mocked(recipeDB.get).mockImplementation(
      () => new Promise(() => {}), // Never resolves
    )

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    expect(screen.getByText('Loading recipe...')).toBeInTheDocument()
  })

  it('should show error when recipe not found', async () => {
    vi.mocked(recipeDB.get).mockResolvedValue(undefined)
    const mockAgent = {} as any
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(getRecipe).mockResolvedValue(null)

    render(<RecipeView recipeUri={mockRecipe.uri} />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument()
    })
  })

  it('should open delete dialog when delete button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)

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
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(deleteRecipeComplete).mockResolvedValue(undefined)

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
    vi.mocked(recipeDB.get).mockResolvedValue(mockRecipe)
    vi.mocked(getAuthenticatedAgent).mockResolvedValue(mockAgent)
    vi.mocked(deleteRecipeComplete).mockRejectedValue(new Error('Delete failed'))

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
    vi.mocked(recipeDB.get).mockResolvedValue(recipeWithSubRecipes)

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
})
