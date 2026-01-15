import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMockOAuthSession,
  createMockAuthSession,
  MockBrowserOAuthClient,
  createOAuthClientMock,
  createLocalStorageMock,
} from './auth'

describe('Auth Mocks', () => {
  describe('createMockOAuthSession', () => {
    it('should create a mock OAuth session with defaults', () => {
      const session = createMockOAuthSession()
      
      expect(session.did).toBe('did:plc:test123')
      expect(session.sub).toBe('testuser.bsky.social')
      expect(typeof session.signOut).toBe('function')
    })

    it('should allow overriding defaults', () => {
      const session = createMockOAuthSession({
        did: 'did:plc:custom',
        sub: 'custom.bsky.social',
      })
      
      expect(session.did).toBe('did:plc:custom')
      expect(session.sub).toBe('custom.bsky.social')
    })

    it('should have a signOut function that resolves', async () => {
      const session = createMockOAuthSession()
      await expect(session.signOut()).resolves.toBeUndefined()
    })
  })

  describe('createMockAuthSession', () => {
    it('should create a mock auth session with defaults', () => {
      const session = createMockAuthSession()
      
      expect(session.did).toBe('did:plc:test123')
      expect(session.handle).toBe('testuser.bsky.social')
    })

    it('should allow overriding defaults', () => {
      const session = createMockAuthSession({
        did: 'did:plc:custom',
        handle: 'custom.bsky.social',
      })
      
      expect(session.did).toBe('did:plc:custom')
      expect(session.handle).toBe('custom.bsky.social')
    })
  })

  describe('MockBrowserOAuthClient', () => {
    let client: MockBrowserOAuthClient

    beforeEach(() => {
      client = new MockBrowserOAuthClient()
    })

    it('should have a static load method', async () => {
      const loaded = await MockBrowserOAuthClient.load({
        clientId: 'test',
        handleResolver: 'https://bsky.social',
      })
      
      expect(loaded).toBeInstanceOf(MockBrowserOAuthClient)
    })

    it('should signIn and create a session', async () => {
      await client.signIn('test.bsky.social')
      
      const result = await client.init()
      expect(result?.session.sub).toBe('test.bsky.social')
    })

    it('should return null from init when no session', async () => {
      const result = await client.init()
      expect(result).toBeNull()
    })

    it('should handle callback and return session', async () => {
      const params = new URLSearchParams({ code: 'test-code' })
      const result = await client.callback(params)
      
      expect(result.session).toBeDefined()
      expect(result.session.did).toBe('did:plc:test123')
    })

    it('should allow setting session manually', async () => {
      const mockSession = createMockOAuthSession({ sub: 'manual.bsky.social' })
      client.setSession(mockSession)
      
      const result = await client.init()
      expect(result?.session.sub).toBe('manual.bsky.social')
    })

    it('should allow clearing session', async () => {
      await client.signIn('test.bsky.social')
      client.setSession(null)
      
      const result = await client.init()
      expect(result).toBeNull()
    })
  })

  describe('createOAuthClientMock', () => {
    it('should create mock with BrowserOAuthClient', () => {
      const mock = createOAuthClientMock()
      
      expect(mock.BrowserOAuthClient).toBeDefined()
      expect(mock.BrowserOAuthClient.load).toBeDefined()
      expect(mock.mockClient).toBeInstanceOf(MockBrowserOAuthClient)
    })

    it('should have load return the mock client', async () => {
      const mock = createOAuthClientMock()
      const client = await mock.BrowserOAuthClient.load({})
      
      expect(client).toBe(mock.mockClient)
    })
  })

  describe('createLocalStorageMock', () => {
    it('should implement getItem', () => {
      const storage = createLocalStorageMock()
      storage.setItem('key', 'value')
      
      expect(storage.getItem('key')).toBe('value')
    })

    it('should return null for non-existent keys', () => {
      const storage = createLocalStorageMock()
      
      expect(storage.getItem('nonexistent')).toBeNull()
    })

    it('should implement setItem', () => {
      const storage = createLocalStorageMock()
      storage.setItem('key', 'value')
      
      expect(storage.store.key).toBe('value')
    })

    it('should implement removeItem', () => {
      const storage = createLocalStorageMock()
      storage.setItem('key', 'value')
      storage.removeItem('key')
      
      expect(storage.getItem('key')).toBeNull()
    })

    it('should implement clear', () => {
      const storage = createLocalStorageMock()
      storage.setItem('key1', 'value1')
      storage.setItem('key2', 'value2')
      storage.clear()
      
      expect(storage.getItem('key1')).toBeNull()
      expect(storage.getItem('key2')).toBeNull()
    })
  })
})
