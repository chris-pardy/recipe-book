/**
 * Tests for RecipeSearch component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecipeSearch } from './RecipeSearch'
import { collectionDB } from '../services/indexeddb'
import { searchRecipes } from '../services/search'

// Mock IndexedDB services
vi.mock('../services/indexeddb', () => ({
  collectionDB: {
    getAll: vi.fn(),
  },
}))

// Mock search service
vi.mock('../services/search', () => ({
  searchRecipes: vi.fn(),
  parseSearchQuery: vi.fn((query: string) => {
    if (query.startsWith('collection:')) {
      return { collectionUri: query.replace('collection:', '') }
    }
    if (query.startsWith('ingredient:')) {
      return { ingredients: [query.replace('ingredient:', '')] }
    }
    return { title: query, ingredients: query.split(/\s+/) }
  }),
}))

describe('RecipeSearch Component', () => {
  const mockOnResultsChange = vi.fn()
  const mockOnSearchChange = vi.fn()
  const mockOnSearchActiveChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    ;(collectionDB.getAll as any).mockResolvedValue([])
    ;(searchRecipes as any).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render search input', () => {
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    expect(screen.getByLabelText(/search recipes/i)).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/search by title or ingredients/i)
    ).toBeInTheDocument()
  })

  it('should debounce search input', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')

    // Should not have called search yet
    expect(searchRecipes).not.toHaveBeenCalled()

    // Fast-forward time
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(searchRecipes).toHaveBeenCalled()
    })
  })

  it('should call onResultsChange when search completes', async () => {
    const user = userEvent.setup({ delay: null })
    const mockResults = [
      {
        recipe: {
          uri: 'at://did:test/recipe1',
          title: 'Chocolate Cake',
          servings: 8,
          ingredients: [],
          steps: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        matchReasons: ['title'],
      },
    ]
    ;(searchRecipes as any).mockResolvedValue(mockResults)

    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(mockOnResultsChange).toHaveBeenCalledWith(mockResults)
    })
  })

  it('should show clear button when search is active', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')

    await waitFor(() => {
      expect(screen.getByText(/clear/i)).toBeInTheDocument()
    })
  })

  it('should clear search when clear button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(screen.getByText(/clear/i)).toBeInTheDocument()
    })

    const clearButton = screen.getByText(/clear/i)
    await user.click(clearButton)

    expect(input).toHaveValue('')
    expect(mockOnResultsChange).toHaveBeenCalledWith([])
  })

  it('should display collections dropdown when collections exist', async () => {
    const mockCollections = [
      {
        uri: 'at://did:test/collection1',
        name: 'Desserts',
        description: 'Sweet treats',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]
    ;(collectionDB.getAll as any).mockResolvedValue(mockCollections)

    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/filter by collection/i)).toBeInTheDocument()
      expect(screen.getByText('Desserts')).toBeInTheDocument()
    })
  })

  it('should filter by collection when collection is selected', async () => {
    const user = userEvent.setup({ delay: null })
    const mockCollections = [
      {
        uri: 'at://did:test/collection1',
        name: 'Desserts',
        description: 'Sweet treats',
        recipeUris: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]
    ;(collectionDB.getAll as any).mockResolvedValue(mockCollections)

    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/filter by collection/i)).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/filter by collection/i)
    await user.selectOptions(select, 'at://did:test/collection1')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(searchRecipes).toHaveBeenCalledWith(
        expect.objectContaining({
          collectionUri: 'at://did:test/collection1',
        })
      )
    })
  })

  it('should show error message when search fails', async () => {
    const user = userEvent.setup({ delay: null })
    ;(searchRecipes as any).mockRejectedValue(new Error('Search failed'))

    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(screen.getByText(/failed to search recipes/i)).toBeInTheDocument()
    })
  })

  it('should show searching indicator', async () => {
    const user = userEvent.setup({ delay: null })
    // Delay the search to see the loading state
    ;(searchRecipes as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(screen.getByText(/searching/i)).toBeInTheDocument()
    })
  })

  it('should call onSearchActiveChange when search becomes active', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(mockOnSearchActiveChange).toHaveBeenCalledWith(true)
    })
  })

  it('should call onSearchActiveChange when search is cleared', async () => {
    const user = userEvent.setup({ delay: null })
    render(
      <RecipeSearch
        onResultsChange={mockOnResultsChange}
        onSearchChange={mockOnSearchChange}
        onSearchActiveChange={mockOnSearchActiveChange}
      />
    )

    const input = screen.getByLabelText(/search recipes/i)
    await user.type(input, 'chocolate')
    vi.advanceTimersByTime(300)

    await waitFor(() => {
      expect(mockOnSearchActiveChange).toHaveBeenCalledWith(true)
    })

    vi.clearAllMocks()

    const clearButton = screen.getByText(/clear/i)
    await user.click(clearButton)

    await waitFor(() => {
      expect(mockOnSearchActiveChange).toHaveBeenCalledWith(false)
    })
  })
})
