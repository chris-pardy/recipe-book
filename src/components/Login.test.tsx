import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Login } from './Login'
import { AuthProvider } from '../hooks/AuthProvider'
import { ReactNode } from 'react'

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

const authService = await import('../services/auth')

describe('Login Component', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render login form', async () => {
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /recipe book/i })).toBeInTheDocument()
    })
    
    expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with bluesky/i })).toBeInTheDocument()
  })

  it('should render description text', async () => {
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/sign in with your bluesky account/i)).toBeInTheDocument()
    })
  })

  it('should render handle input with placeholder', async () => {
    render(<Login />, { wrapper })

    await waitFor(() => {
      const input = screen.getByLabelText(/bluesky handle/i)
      expect(input).toHaveAttribute('placeholder', 'your-handle.bsky.social')
    })
  })

  it('should update handle on input change', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, 'test.bsky.social')

    expect(input).toHaveValue('test.bsky.social')
  })

  it('should call login on form submit', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, 'test.bsky.social')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    await user.click(button)

    expect(authService.startLogin).toHaveBeenCalledWith('test.bsky.social')
  })

  it('should trim whitespace from handle', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, '  test.bsky.social  ')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    await user.click(button)

    expect(authService.startLogin).toHaveBeenCalledWith('test.bsky.social')
  })

  it('should disable button when handle is empty', async () => {
    render(<Login />, { wrapper })

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /sign in with bluesky/i })
      expect(button).toBeDisabled()
    })
  })

  it('should not submit when handle is only whitespace', async () => {
    const user = userEvent.setup()
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, '   ')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    expect(button).toBeDisabled()
  })

  it('should display error message when auth fails', async () => {
    vi.mocked(authService.startLogin).mockRejectedValueOnce(new Error('Authentication failed'))
    const user = userEvent.setup()
    
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, 'test.bsky.social')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Authentication failed')
    })
  })

  it('should show loading state during login', async () => {
    // Make startLogin hang
    vi.mocked(authService.startLogin).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, 'test.bsky.social')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    await user.click(button)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument()
    })
  })

  it('should disable input during loading', async () => {
    vi.mocked(authService.startLogin).mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/bluesky handle/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/bluesky handle/i)
    await user.type(input, 'test.bsky.social')

    const button = screen.getByRole('button', { name: /sign in with bluesky/i })
    await user.click(button)

    await waitFor(() => {
      expect(input).toBeDisabled()
    })
  })

  it('should accept custom className', async () => {
    render(<Login className="custom-class" />, { wrapper })

    await waitFor(() => {
      // The custom class is on the outermost container div
      const container = screen.getByRole('heading', { name: /recipe book/i }).closest('.custom-class')
      expect(container).toBeInTheDocument()
      expect(container).toHaveClass('custom-class')
    })
  })

  it('should have helper text for handle format', async () => {
    render(<Login />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/enter your full handle/i)).toBeInTheDocument()
    })
  })
})
