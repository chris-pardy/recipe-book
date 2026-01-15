/**
 * Tests for Home component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Home } from './Home'
import { AuthProvider } from '../hooks/AuthProvider'
import { BrowserRouter } from 'react-router-dom'
import { collectionDB, recipeDB } from '../services/indexeddb'

// Mock the auth service
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

// Mock IndexedDB services
vi.mock('../services/indexeddb', () => ({
  collectionDB: {
    getAll: vi.fn(),
  },
  recipeDB: {
    getAll: vi.fn(),
  },
}))

describe('Home Component', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <AuthProvider>{children}</AuthProvider>
    </BrowserRouter>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show welcome message when not authenticated', async () => {
    render(<Home />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/welcome to recipe book/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/sign in to view/i)).toBeInTheDocument()
  })

  it('should show collections when they exist', async () => {
    const authService = await import('../services/auth')
    const mockSession = { did: 'did:plc:test', sub: 'test.bsky.social' }
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    const mockCollections = [
      {
        uri: 'at://did:plc:test/dev.chrispardy.collections/1',
        name: 'Desserts',
        description: 'Sweet treats',
        recipeUris: ['at://did:plc:test/dev.chrispardy.recipes/1'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    vi.mocked(collectionDB.getAll).mockResolvedValueOnce(mockCollections)

    render(<Home />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('Collections')).toBeInTheDocument()
      expect(screen.getByText('Desserts')).toBeInTheDocument()
    })
  })

  it('should show all recipes when no collections exist', async () => {
    const authService = await import('../services/auth')
    const mockSession = { did: 'did:plc:test', sub: 'test.bsky.social' }
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    vi.mocked(collectionDB.getAll).mockResolvedValueOnce([])

    const mockRecipes = [
      {
        uri: 'at://did:plc:test/dev.chrispardy.recipes/1',
        title: 'Chocolate Cake',
        servings: 8,
        ingredients: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    vi.mocked(recipeDB.getAll).mockResolvedValueOnce(mockRecipes)

    render(<Home />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('All Recipes')).toBeInTheDocument()
      expect(screen.getByText('Chocolate Cake')).toBeInTheDocument()
    })
  })

  it('should show empty state when no recipes exist', async () => {
    const authService = await import('../services/auth')
    const mockSession = { did: 'did:plc:test', sub: 'test.bsky.social' }
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    vi.mocked(collectionDB.getAll).mockResolvedValueOnce([])
    vi.mocked(recipeDB.getAll).mockResolvedValueOnce([])

    render(<Home />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('No recipes yet')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /create your first recipe/i })).toBeInTheDocument()
    })
  })

  it('should handle errors gracefully', async () => {
    const authService = await import('../services/auth')
    const mockSession = { did: 'did:plc:test', sub: 'test.bsky.social' }
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    vi.mocked(collectionDB.getAll).mockRejectedValueOnce(new Error('Database error'))

    render(<Home />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })
})
