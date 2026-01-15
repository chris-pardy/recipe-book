import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthProvider } from '../hooks/AuthProvider'
import { BrowserRouter } from 'react-router-dom'
import { ReactNode } from 'react'

interface MockSession {
  did: string
  sub: string
  signOut: ReturnType<typeof vi.fn>
}

// Create mutable mock state
let mockIsAuthenticated = false
let mockSession: MockSession | null = null

// Mock the auth service
vi.mock('../services/auth', () => ({
  initializeOAuthClient: vi.fn().mockResolvedValue({}),
  startLogin: vi.fn().mockResolvedValue(undefined),
  handleOAuthCallback: vi.fn().mockImplementation(async () => null),
  initializeFromStorage: vi.fn().mockImplementation(async () => {
    if (mockIsAuthenticated && mockSession) {
      return mockSession
    }
    return null
  }),
  logout: vi.fn().mockResolvedValue(undefined),
  toAuthSession: vi.fn((session: { did: string; sub: string }) => ({
    did: session.did,
    handle: session.sub,
  })),
  saveAuthState: vi.fn(),
  clearAuthState: vi.fn(),
}))

describe('ProtectedRoute Component', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BrowserRouter>
      <AuthProvider>{children}</AuthProvider>
    </BrowserRouter>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = false
    mockSession = null
  })

  it('should show loading state initially', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
      { wrapper }
    )

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('should redirect to login when not authenticated', async () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
      { wrapper }
    )

    await waitFor(() => {
      // Should redirect to login page
      expect(window.location.pathname).toBe('/login')
    })
  })

  it('should render children when authenticated', async () => {
    mockIsAuthenticated = true
    mockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
    
    const authService = await import('../services/auth')
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
      { wrapper }
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('should use custom fallback when provided', async () => {
    render(
      <ProtectedRoute fallback={<div>Custom Fallback</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>,
      { wrapper }
    )

    await waitFor(() => {
      expect(screen.getByText('Custom Fallback')).toBeInTheDocument()
    })
    
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('should render complex children correctly', async () => {
    mockIsAuthenticated = true
    mockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
    
    const authService = await import('../services/auth')
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    render(
      <ProtectedRoute>
        <div>
          <h1>Dashboard</h1>
          <p>Welcome to the app</p>
          <button>Action</button>
        </div>
      </ProtectedRoute>,
      { wrapper }
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByText('Welcome to the app')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    })
  })

  it('should show loading spinner with proper accessibility', () => {
    render(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>,
      { wrapper }
    )

    // Check that loading text is visible for accessibility
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
