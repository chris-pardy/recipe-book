/**
 * Authentication service for Bluesky OAuth
 * Uses @atproto/oauth-client-browser for OAuth flow
 */

import {
  BrowserOAuthClient,
  OAuthSession,
} from '@atproto/oauth-client-browser'
import type { AuthSession } from '../types/auth'

const CLIENT_ID = typeof window !== 'undefined' 
  ? `${window.location.origin}/client-metadata.json`
  : 'http://localhost:5173/client-metadata.json'

let oauthClient: BrowserOAuthClient | null = null

/**
 * Initialize the OAuth client
 * Must be called before using any auth functions
 */
export async function initializeOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) {
    return oauthClient
  }

  oauthClient = await BrowserOAuthClient.load({
    clientId: CLIENT_ID,
    handleResolver: 'https://bsky.social',
  })

  return oauthClient
}

/**
 * Get the initialized OAuth client
 * Throws if not initialized
 */
export function getOAuthClient(): BrowserOAuthClient {
  if (!oauthClient) {
    throw new Error('OAuth client not initialized. Call initializeOAuthClient first.')
  }
  return oauthClient
}

/**
 * Start the OAuth login flow
 * Redirects the user to Bluesky for authorization
 */
export async function startLogin(handle: string): Promise<void> {
  const client = getOAuthClient()
  await client.signIn(handle, {
    scope: 'atproto transition:generic',
  })
}

/**
 * Handle the OAuth callback after authorization
 * Returns the session if successful
 */
export async function handleOAuthCallback(): Promise<OAuthSession | null> {
  const client = getOAuthClient()
  
  // Check if we're returning from an OAuth redirect
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  
  // OAuth callback will have code or error parameters
  if (params.has('code') || params.has('error') || hash.has('code') || hash.has('error')) {
    try {
      const result = await client.callback(params)
      // Clear the URL parameters after handling
      window.history.replaceState({}, '', window.location.pathname)
      return result.session
    } catch (error) {
      // Clear the URL parameters even on error
      window.history.replaceState({}, '', window.location.pathname)
      throw error
    }
  }
  
  return null
}

/**
 * Initialize auth from stored session
 * Returns the existing session if available
 */
export async function initializeFromStorage(): Promise<OAuthSession | null> {
  const client = getOAuthClient()
  const result = await client.init()
  return result?.session ?? null
}

/**
 * Logout and clear the session
 */
export async function logout(session: OAuthSession): Promise<void> {
  await session.signOut()
}

/**
 * Convert OAuthSession to AuthSession
 */
export function toAuthSession(session: OAuthSession): AuthSession {
  return {
    did: session.did,
    handle: session.sub,
  }
}

/**
 * Storage key for persisting auth state
 */
export const AUTH_STORAGE_KEY = 'recipe-book-auth'

/**
 * Save auth session reference to localStorage
 */
export function saveAuthState(session: AuthSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

/**
 * Load auth session reference from localStorage
 */
export function loadAuthState(): AuthSession | null {
  const stored = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!stored) return null
  
  try {
    return JSON.parse(stored) as AuthSession
  } catch {
    return null
  }
}

/**
 * Clear auth session from localStorage
 */
export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
