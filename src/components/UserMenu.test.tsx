import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserMenu } from './UserMenu'
import { AuthProvider } from '../hooks/AuthProvider'
import { ReactNode } from 'react'

interface MockSession {
  did: string
  sub: string
  signOut: ReturnType<typeof vi.fn>
}

// Create mutable mock state
let mockSession: MockSession | null = null

// Mock the auth service
vi.mock('../services/auth', () => ({
  initializeOAuthClient: vi.fn().mockResolvedValue({}),
  startLogin: vi.fn().mockResolvedValue(undefined),
  handleOAuthCallback: vi.fn().mockResolvedValue(null),
  initializeFromStorage: vi.fn().mockImplementation(async () => mockSession),
  logout: vi.fn().mockResolvedValue(undefined),
  toAuthSession: vi.fn((session: { did: string; sub: string }) => ({
    did: session.did,
    handle: session.sub,
  })),
  saveAuthState: vi.fn(),
  clearAuthState: vi.fn(),
}))

const authService = await import('../services/auth')

describe('UserMenu Component', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    mockSession = null
  })

  it('should render nothing when not authenticated', async () => {
    const { container } = render(<UserMenu />, { wrapper })

    await waitFor(() => {
      // Wait for auth to initialize
    })

    // Give time for state to settle
    await new Promise(resolve => setTimeout(resolve, 100))
    
    expect(container.firstChild).toBeNull()
  })

  it('should render user handle when authenticated', async () => {
    mockSession = { did: 'did:plc:test', sub: 'testuser.bsky.social', signOut: vi.fn() }

    render(<UserMenu />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('@testuser.bsky.social')).toBeInTheDocument()
    })
  })

  it('should render sign out button when authenticated', async () => {
    mockSession = { did: 'did:plc:test', sub: 'testuser.bsky.social', signOut: vi.fn() }

    render(<UserMenu />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })
  })

  it('should call logout when sign out button is clicked', async () => {
    mockSession = { did: 'did:plc:test', sub: 'testuser.bsky.social', signOut: vi.fn() }
    const user = userEvent.setup()

    render(<UserMenu />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)

    expect(authService.logout).toHaveBeenCalled()
  })

  it('should show loading state during logout', async () => {
    mockSession = { did: 'did:plc:test', sub: 'testuser.bsky.social', signOut: vi.fn() }
    vi.mocked(authService.logout).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()

    render(<UserMenu />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    })

    const button = screen.getByRole('button', { name: /sign out/i })
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing out/i })).toBeInTheDocument()
    })
  })

  it('should accept custom className', async () => {
    mockSession = { did: 'did:plc:test', sub: 'testuser.bsky.social', signOut: vi.fn() }

    render(<UserMenu className="custom-class" />, { wrapper })

    await waitFor(() => {
      const container = screen.getByText('@testuser.bsky.social').parentElement
      expect(container).toHaveClass('custom-class')
    })
  })

  it('should display different handles correctly', async () => {
    mockSession = { did: 'did:plc:other', sub: 'another.custom.domain', signOut: vi.fn() }

    render(<UserMenu />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText('@another.custom.domain')).toBeInTheDocument()
    })
  })
})
