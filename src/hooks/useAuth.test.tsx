import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ReactNode } from 'react'
import { useAuth } from './useAuth'
import { AuthProvider } from './AuthProvider'

interface MockSession {
  did: string
  sub: string
  signOut: ReturnType<typeof vi.fn>
}

// Mock the auth service
vi.mock('../services/auth', () => {
  let mockSession: MockSession | null = null
  
  return {
    initializeOAuthClient: vi.fn().mockResolvedValue({}),
    startLogin: vi.fn().mockImplementation(async () => {
      // Simulate that login redirects (doesn't return normally)
      // In tests, we can make it succeed for verification
    }),
    handleOAuthCallback: vi.fn().mockImplementation(async () => {
      return mockSession
    }),
    initializeFromStorage: vi.fn().mockImplementation(async () => {
      return mockSession
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    toAuthSession: vi.fn().mockImplementation((session: { did: string; sub: string }) => ({
      did: session.did,
      handle: session.sub,
    })),
    saveAuthState: vi.fn(),
    clearAuthState: vi.fn(),
    // Helper for tests to control mock state
    __setMockSession: (session: MockSession | null) => {
      mockSession = session
    },
  }
})

// Get mocked module for manipulation
const authService = await import('../services/auth')

describe('useAuth Hook', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  beforeEach(() => {
    vi.clearAllMocks()
    ;(authService as unknown as { __setMockSession: (s: MockSession | null) => void }).__setMockSession(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should start with loading state', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      // Initial state should be loading
      expect(result.current.isLoading).toBe(true)
      
      // Wait for initialization to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should initialize without authentication when no session', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.session).toBeNull()
      expect(result.current.error).toBeNull()
    })
  })

  describe('login', () => {
    it('should call startLogin with handle', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.login('test.bsky.social')
      })

      expect(authService.startLogin).toHaveBeenCalledWith('test.bsky.social')
    })

    it('should set loading state during login', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Start login (don't await)
      act(() => {
        result.current.login('test.bsky.social')
      })

      // Should be loading
      expect(result.current.isLoading).toBe(true)
    })

    it('should handle login errors', async () => {
      const error = new Error('Login failed')
      vi.mocked(authService.startLogin).mockRejectedValueOnce(error)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.login('test.bsky.social')
      })

      expect(result.current.error).toBe('Login failed')
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear authentication state', async () => {
      // Set up authenticated state first
      const mockSessionData: MockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
      ;(authService as unknown as { __setMockSession: (s: MockSession | null) => void }).__setMockSession(mockSessionData)
      vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSessionData as unknown as ReturnType<typeof authService.initializeFromStorage>)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.session).toBeNull()
      expect(authService.clearAuthState).toHaveBeenCalled()
    })

    it('should call logout service', async () => {
      const mockSessionData: MockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
      ;(authService as unknown as { __setMockSession: (s: MockSession | null) => void }).__setMockSession(mockSessionData)
      vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSessionData as unknown as ReturnType<typeof authService.initializeFromStorage>)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(authService.logout).toHaveBeenCalled()
    })

    it('should handle logout errors gracefully', async () => {
      const mockSessionData: MockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
      ;(authService as unknown as { __setMockSession: (s: MockSession | null) => void }).__setMockSession(mockSessionData)
      vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSessionData as unknown as ReturnType<typeof authService.initializeFromStorage>)
      vi.mocked(authService.logout).mockRejectedValueOnce(new Error('Logout failed'))

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      await act(async () => {
        await result.current.logout()
      })

      // Should still clear state even on error
      expect(result.current.isAuthenticated).toBe(false)
      expect(authService.clearAuthState).toHaveBeenCalled()
    })
  })

  describe('session restoration', () => {
    it('should restore session from storage on mount', async () => {
      const mockSessionData: MockSession = { did: 'did:plc:test', sub: 'test.bsky.social', signOut: vi.fn() }
      vi.mocked(authService.initializeFromStorage).mockResolvedValueOnce(mockSessionData as unknown as ReturnType<typeof authService.initializeFromStorage>)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
      })

      expect(result.current.session).toEqual({
        did: 'did:plc:test',
        handle: 'test.bsky.social',
      })
    })
  })

  describe('error handling', () => {
    it('should handle initialization errors', async () => {
      vi.mocked(authService.initializeOAuthClient).mockRejectedValueOnce(new Error('Init failed'))

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('Init failed')
      expect(result.current.isAuthenticated).toBe(false)
    })
  })
})

describe('useAuth without provider', () => {
  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      renderHook(() => useAuth())
    }).toThrow('useAuth must be used within an AuthProvider')

    consoleSpy.mockRestore()
  })
})
