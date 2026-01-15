/**
 * TypeScript types for authentication
 */

export interface AuthSession {
  did: string
  handle: string
}

export interface AuthState {
  isLoading: boolean
  isAuthenticated: boolean
  session: AuthSession | null
  error: string | null
}

export interface AuthContextValue extends AuthState {
  login: (handle: string) => Promise<void>
  logout: () => Promise<void>
  handleCallback: () => Promise<void>
}
