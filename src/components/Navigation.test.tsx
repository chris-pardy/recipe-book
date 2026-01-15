/**
 * Tests for Navigation component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Navigation } from './Navigation'
import { AuthProvider } from '../hooks/AuthProvider'
import { BrowserRouter } from 'react-router-dom'

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

describe('Navigation Component', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <AuthProvider>{children}</AuthProvider>
    </BrowserRouter>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render navigation with app title', () => {
    render(<Navigation />, { wrapper })

    expect(screen.getByText('Recipe Book')).toBeInTheDocument()
  })

  it('should show sign in button when not authenticated', async () => {
    render(<Navigation />, { wrapper })

    await screen.findByRole('link', { name: /sign in/i })
    expect(screen.queryByText(/home/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/create recipe/i)).not.toBeInTheDocument()
  })

  it('should show navigation links when authenticated', async () => {
    const authService = await import('../services/auth')
    const mockSession = { did: 'did:plc:test', sub: 'test.bsky.social' }
    vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSession)

    render(<Navigation />, { wrapper })

    await screen.findByRole('link', { name: /home/i })
    expect(screen.getByRole('link', { name: /create recipe/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('should have correct links to routes', () => {
    render(<Navigation />, { wrapper })

    const homeLink = screen.getByRole('link', { name: /recipe book/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })
})
