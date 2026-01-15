/**
 * Mock implementation of authentication services
 * This provides mocks for @atproto/oauth-client-browser
 */

import { vi } from 'vitest'
import type { AuthSession } from '../../types/auth'

export interface MockOAuthSession {
  did: string
  sub: string
  signOut: ReturnType<typeof vi.fn>
}

/**
 * Create a mock OAuth session
 */
export function createMockOAuthSession(overrides: Partial<MockOAuthSession> = {}): MockOAuthSession {
  return {
    did: 'did:plc:test123',
    sub: 'testuser.bsky.social',
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/**
 * Create a mock AuthSession
 */
export function createMockAuthSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    did: 'did:plc:test123',
    handle: 'testuser.bsky.social',
    ...overrides,
  }
}

/**
 * Mock BrowserOAuthClient
 */
export class MockBrowserOAuthClient {
  private session: MockOAuthSession | null = null
  
  static load = vi.fn().mockImplementation(async () => {
    return new MockBrowserOAuthClient()
  })

  async signIn(handle: string): Promise<void> {
    // In real OAuth, this redirects. In tests, we simulate success.
    this.session = createMockOAuthSession({ sub: handle })
  }

  async init(): Promise<{ session: MockOAuthSession } | null> {
    if (this.session) {
      return { session: this.session }
    }
    return null
  }

  async callback(): Promise<{ session: MockOAuthSession }> {
    const session = createMockOAuthSession()
    this.session = session
    return { session }
  }

  setSession(session: MockOAuthSession | null): void {
    this.session = session
  }

  getSession(): MockOAuthSession | null {
    return this.session
  }
}

/**
 * Create mock for @atproto/oauth-client-browser module
 */
export function createOAuthClientMock() {
  const mockClient = new MockBrowserOAuthClient()
  
  return {
    BrowserOAuthClient: {
      load: vi.fn().mockResolvedValue(mockClient),
    },
    mockClient,
  }
}

/**
 * Mock localStorage for auth storage
 */
export function createLocalStorageMock() {
  const store: Record<string, string> = {}
  
  return {
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
    get store() {
      return { ...store }
    },
  }
}
