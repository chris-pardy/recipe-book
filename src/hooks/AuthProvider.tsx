/**
 * Authentication provider component for managing Bluesky OAuth state
 * 
 * This provider:
 * - Initializes the OAuth client on mount
 * - Handles OAuth callbacks from Bluesky
 * - Restores existing sessions from storage
 * - Provides authentication state and methods to child components
 * 
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */

import {
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { OAuthSession } from '@atproto/oauth-client-browser'
import type { AuthContextValue, AuthState } from '../types/auth'
import {
  initializeOAuthClient,
  startLogin,
  handleOAuthCallback,
  initializeFromStorage,
  logout as logoutService,
  toAuthSession,
  saveAuthState,
  clearAuthState,
} from '../services/auth'
import { AuthContext } from './AuthContext'

const initialState: AuthState = {
  isLoading: true,
  isAuthenticated: false,
  session: null,
  error: null,
}

export interface AuthProviderProps {
  /** Child components that will have access to the auth context */
  children: ReactNode
}

/**
 * AuthProvider component that wraps the app and provides authentication context
 * @param props - Component props
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState)
  const [oauthSession, setOAuthSession] = useState<OAuthSession | null>(null)

  // Initialize OAuth client and restore session on mount
  useEffect(() => {
    let mounted = true

    async function initialize() {
      try {
        await initializeOAuthClient()

        // First check if this is an OAuth callback
        const callbackSession = await handleOAuthCallback()
        if (callbackSession && mounted) {
          const authSession = toAuthSession(callbackSession)
          saveAuthState(authSession)
          setOAuthSession(callbackSession)
          setState({
            isLoading: false,
            isAuthenticated: true,
            session: authSession,
            error: null,
          })
          return
        }

        // Try to restore existing session
        const existingSession = await initializeFromStorage()
        if (existingSession && mounted) {
          const authSession = toAuthSession(existingSession)
          saveAuthState(authSession)
          setOAuthSession(existingSession)
          setState({
            isLoading: false,
            isAuthenticated: true,
            session: authSession,
            error: null,
          })
          return
        }

        // No session found
        if (mounted) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            session: null,
            error: null,
          })
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        if (mounted) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            session: null,
            error: error instanceof Error ? error.message : 'Failed to initialize authentication',
          })
        }
      }
    }

    initialize()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Start the OAuth login flow
   * Redirects the user to Bluesky for authorization
   * @param handle - The Bluesky handle (e.g., username.bsky.social)
   */
  const login = useCallback(async (handle: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      // This will redirect to Bluesky, so we won't reach the code after this
      await startLogin(handle)
    } catch (error) {
      console.error('Login error:', error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start login',
      }))
    }
  }, [])

  /**
   * Logout and clear the current session
   * Clears both OAuth session and localStorage state
   */
  const logout = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      if (oauthSession) {
        await logoutService(oauthSession)
      }
      clearAuthState()
      setOAuthSession(null)
      setState({
        isLoading: false,
        isAuthenticated: false,
        session: null,
        error: null,
      })
    } catch (error) {
      console.error('Logout error:', error)
      // Clear state even on error
      clearAuthState()
      setOAuthSession(null)
      setState({
        isLoading: false,
        isAuthenticated: false,
        session: null,
        error: error instanceof Error ? error.message : 'Failed to logout',
      })
    }
  }, [oauthSession])

  /**
   * Manually handle OAuth callback
   * This is typically called automatically on mount, but can be called manually if needed
   * @internal This is exposed in the context but usually not needed by consumers
   */
  const handleCallbackFn = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      const session = await handleOAuthCallback()
      if (session) {
        const authSession = toAuthSession(session)
        saveAuthState(authSession)
        setOAuthSession(session)
        setState({
          isLoading: false,
          isAuthenticated: true,
          session: authSession,
          error: null,
        })
      } else {
        setState(prev => ({ ...prev, isLoading: false }))
      }
    } catch (error) {
      console.error('Callback error:', error)
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to complete authentication',
      }))
    }
  }, [])

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    handleCallback: handleCallbackFn,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
