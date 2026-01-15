import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { AuthProvider } from './hooks/AuthProvider'

// Mock the auth service
vi.mock('./services/auth', () => ({
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
vi.mock('./services/indexeddb', () => ({
  initDB: vi.fn().mockResolvedValue({}),
  collectionDB: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  recipeDB: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}))

describe('App', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders navigation', () => {
    render(<App />, { wrapper })

    expect(screen.getByText('Recipe Book')).toBeInTheDocument()
  })

  it('renders home page by default', async () => {
    render(<App />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/welcome to recipe book/i)).toBeInTheDocument()
    })
  })

  it('navigates to login page', async () => {
    render(<App />, { wrapper })

    await waitFor(() => {
      // Navigation shows a button with "Sign In" text inside a Link
      const loginButton = screen.getByRole('button', { name: /sign in/i })
      expect(loginButton).toBeInTheDocument()
    })

    const loginButton = screen.getByRole('button', { name: /sign in/i })
    await userEvent.click(loginButton)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in with bluesky/i })).toBeInTheDocument()
    })
  })

  it('shows 404 page for unknown routes', async () => {
    // Use window.location to navigate to unknown route
    window.history.pushState({}, '', '/unknown-route')
    render(<App />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('404')).toBeInTheDocument()
      expect(screen.getByText(/page not found/i)).toBeInTheDocument()
    })
  })
})
