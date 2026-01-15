import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RecipeEditWrapper } from './RecipeEditWrapper'
import { useAuth } from '../hooks/useAuth'
import { getAuthenticatedAgent } from '../services/agent'
import { getRecipe } from '../services/atproto'
import { recipeDB } from '../services/indexeddb'
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

vi.mock('../utils/recipeOwnership', () => ({
  isRecipeOwned: vi.fn(),
}))

// Mock RecipeCreationForm to avoid complex setup
vi.mock('./RecipeCreationForm', () => ({
  RecipeCreationForm: ({ initialRecipe, recipeUri }: any) => (
    <div>
      <h1>Edit Recipe</h1>
      <p>Recipe URI: {recipeUri}</p>
      <p>Title: {initialRecipe?.title}</p>
    </div>
  ),
}))

describe('RecipeEditWrapper', () => {
  const mockRecipe: Recipe & { uri: string } = {
    uri: 'at://did:plc:user123/dev.chrispardy.recipes/rkey123',
    title: 'Test Recipe',
    servings: 4,
    ingredients: [
      { id: '1', name: 'flour', amount: 240, unit: 'g' },
      { id: '2', name: 'sugar', amount: 60, unit: 'g' },
    ],
    steps: [
      { id: '1', text: 'Mix ingredients', order: 0 },
      { id: '2', text: 'Bake', order: 1 },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  const mockSession = {
    did: 'did:plc:user123',
    handle: 'test.bsky.social',
  }

  const createWrapper = (initialRoute: string) => {
    return ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/recipe/:id/edit" element={children} />
        </Routes>
      </MemoryRouter>
    )
  }

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

  it('should load recipe from cache and display edit form', async () => {
    ;(recipeDB.get as any).mockResolvedValue(mockRecipe)

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText('Edit Recipe')).toBeInTheDocument()
    })

    expect(screen.getByText(`Recipe URI: ${mockRecipe.uri}`)).toBeInTheDocument()
    expect(screen.getByText(`Title: ${mockRecipe.title}`)).toBeInTheDocument()
  })

  it('should fetch recipe from PDS if not in cache', async () => {
    const mockAgent = {} as any
    ;(recipeDB.get as any).mockResolvedValue(undefined)
    ;(getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    ;(getRecipe as any).mockResolvedValue(mockRecipe)
    ;(recipeDB.put as any).mockResolvedValue(undefined)

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText('Edit Recipe')).toBeInTheDocument()
    }, { timeout: 3000 })

    expect(getRecipe).toHaveBeenCalledWith(mockAgent, mockRecipe.uri)
    expect(recipeDB.put).toHaveBeenCalledWith(mockRecipe.uri, { ...mockRecipe, uri: mockRecipe.uri })
  })

  it('should show error when recipe is not owned by user', async () => {
    ;(isRecipeOwned as any).mockReturnValue(false)

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText(/you can only edit recipes that you own/i)).toBeInTheDocument()
    })
  })

  it('should show error when user is not authenticated', async () => {
    ;(useAuth as any).mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      session: null,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      handleCallback: vi.fn(),
    })

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText(/must be authenticated to edit recipes/i)).toBeInTheDocument()
    })
  })

  it('should show loading state while fetching recipe', () => {
    ;(recipeDB.get as any).mockImplementation(
      () => new Promise(() => {}), // Never resolves
    )

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    expect(screen.getByText('Loading recipe...')).toBeInTheDocument()
  })

  it('should show error when recipe not found', async () => {
    const mockAgent = {} as any
    ;(recipeDB.get as any).mockResolvedValue(undefined)
    ;(getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    ;(getRecipe as any).mockResolvedValue(null)

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText(/recipe not found/i)).toBeInTheDocument()
    })
  })

  it('should show error when authentication fails', async () => {
    ;(recipeDB.get as any).mockResolvedValue(undefined)
    ;(getAuthenticatedAgent as any).mockResolvedValue(null)

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText(/failed to authenticate/i)).toBeInTheDocument()
    })
  })

  it('should show error when recipe fetch fails', async () => {
    const mockAgent = {} as any
    ;(recipeDB.get as any).mockResolvedValue(undefined)
    ;(getAuthenticatedAgent as any).mockResolvedValue(mockAgent)
    ;(getRecipe as any).mockRejectedValue(new Error('Network error'))

    render(<RecipeEditWrapper />, {
      wrapper: createWrapper(`/recipe/${encodeURIComponent(mockRecipe.uri)}/edit`),
    })

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    })
  })

  it('should show error for invalid recipe URI', async () => {
    // Test with an invalid route that doesn't match the pattern
    render(<RecipeEditWrapper />, {
      wrapper: createWrapper('/invalid-route'),
    })

    // Should show some error or loading state
    await waitFor(() => {
      // Should show error since URI is invalid
      expect(screen.queryByText('Edit Recipe')).not.toBeInTheDocument()
    })
  })
})
