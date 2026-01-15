import { describe, it, expect } from 'vitest'
import type { AuthSession, AuthState, AuthContextValue } from './auth'

describe('Auth Types', () => {
  describe('AuthSession', () => {
    it('should accept valid session objects', () => {
      const session: AuthSession = {
        did: 'did:plc:abc123',
        handle: 'user.bsky.social',
      }

      expect(session.did).toBe('did:plc:abc123')
      expect(session.handle).toBe('user.bsky.social')
    })
  })

  describe('AuthState', () => {
    it('should accept loading state', () => {
      const state: AuthState = {
        isLoading: true,
        isAuthenticated: false,
        session: null,
        error: null,
      }

      expect(state.isLoading).toBe(true)
      expect(state.isAuthenticated).toBe(false)
      expect(state.session).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should accept authenticated state', () => {
      const state: AuthState = {
        isLoading: false,
        isAuthenticated: true,
        session: {
          did: 'did:plc:abc123',
          handle: 'user.bsky.social',
        },
        error: null,
      }

      expect(state.isLoading).toBe(false)
      expect(state.isAuthenticated).toBe(true)
      expect(state.session).not.toBeNull()
    })

    it('should accept error state', () => {
      const state: AuthState = {
        isLoading: false,
        isAuthenticated: false,
        session: null,
        error: 'Authentication failed',
      }

      expect(state.error).toBe('Authentication failed')
    })
  })

  describe('AuthContextValue', () => {
    it('should extend AuthState with methods', () => {
      const contextValue: AuthContextValue = {
        isLoading: false,
        isAuthenticated: false,
        session: null,
        error: null,
        login: async () => {},
        logout: async () => {},
        handleCallback: async () => {},
      }

      expect(typeof contextValue.login).toBe('function')
      expect(typeof contextValue.logout).toBe('function')
      expect(typeof contextValue.handleCallback).toBe('function')
    })
  })
})
