import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  toAuthSession,
  saveAuthState,
  loadAuthState,
  clearAuthState,
  AUTH_STORAGE_KEY,
} from './auth'
import { createMockOAuthSession } from '../test/mocks/auth'

describe('Auth Service', () => {
  let originalLocalStorage: Storage

  beforeEach(() => {
    // Store original localStorage
    originalLocalStorage = window.localStorage
    
    // Create a mock localStorage
    const store: Record<string, string> = {}
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key]
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach(key => delete store[key])
      }),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      get length() {
        return Object.keys(store).length
      },
    }
    
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })
  })

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    })
    vi.clearAllMocks()
  })

  describe('toAuthSession', () => {
    it('should convert OAuthSession to AuthSession', () => {
      const oauthSession = createMockOAuthSession({
        did: 'did:plc:abc123',
        sub: 'user.bsky.social',
      })

      const authSession = toAuthSession(oauthSession as unknown as Parameters<typeof toAuthSession>[0])

      expect(authSession.did).toBe('did:plc:abc123')
      expect(authSession.handle).toBe('user.bsky.social')
    })

    it('should handle different DIDs correctly', () => {
      const oauthSession = createMockOAuthSession({
        did: 'did:web:example.com',
        sub: 'custom.handle',
      })

      const authSession = toAuthSession(oauthSession as unknown as Parameters<typeof toAuthSession>[0])

      expect(authSession.did).toBe('did:web:example.com')
      expect(authSession.handle).toBe('custom.handle')
    })
  })

  describe('saveAuthState', () => {
    it('should save auth session to localStorage', () => {
      const session = { did: 'did:plc:test', handle: 'test.bsky.social' }

      saveAuthState(session)

      expect(localStorage.setItem).toHaveBeenCalledWith(
        AUTH_STORAGE_KEY,
        JSON.stringify(session)
      )
    })

    it('should overwrite existing session', () => {
      const session1 = { did: 'did:plc:test1', handle: 'test1.bsky.social' }
      const session2 = { did: 'did:plc:test2', handle: 'test2.bsky.social' }

      saveAuthState(session1)
      saveAuthState(session2)

      expect(localStorage.setItem).toHaveBeenLastCalledWith(
        AUTH_STORAGE_KEY,
        JSON.stringify(session2)
      )
    })
  })

  describe('loadAuthState', () => {
    it('should load auth session from localStorage', () => {
      const session = { did: 'did:plc:test', handle: 'test.bsky.social' }
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(session))

      const loaded = loadAuthState()

      expect(loaded).toEqual(session)
    })

    it('should return null when no session stored', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      const loaded = loadAuthState()

      expect(loaded).toBeNull()
    })

    it('should return null for invalid JSON', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid-json')

      const loaded = loadAuthState()

      expect(loaded).toBeNull()
    })

    it('should return null for empty string', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('')

      const loaded = loadAuthState()

      expect(loaded).toBeNull()
    })
  })

  describe('clearAuthState', () => {
    it('should remove auth session from localStorage', () => {
      clearAuthState()

      expect(localStorage.removeItem).toHaveBeenCalledWith(AUTH_STORAGE_KEY)
    })
  })

  describe('AUTH_STORAGE_KEY', () => {
    it('should be a non-empty string', () => {
      expect(typeof AUTH_STORAGE_KEY).toBe('string')
      expect(AUTH_STORAGE_KEY.length).toBeGreaterThan(0)
    })
  })
})
