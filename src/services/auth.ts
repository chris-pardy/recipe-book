/**
 * Authentication service for Bluesky OAuth
 * Uses @atproto/oauth-client-browser for OAuth flow
 */

import {
  BrowserOAuthClient,
  OAuthSession,
} from '@atproto/oauth-client-browser'
import type { AuthSession } from '../types/auth'

/**
 * Get the OAuth client ID from environment variable or fallback to origin-based URL
 * Uses VITE_CLIENT_METADATA_URL if set, otherwise constructs from window.location.origin
 * @returns The client ID URL for OAuth client initialization
 */
function getClientId(): string {
  // Check for environment variable first (for production builds)
  if (import.meta.env.VITE_CLIENT_METADATA_URL) {
    return import.meta.env.VITE_CLIENT_METADATA_URL
  }
  
  // Fallback to origin-based URL (for development)
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/client-metadata.json`
  }
  
  // SSR fallback (shouldn't happen in browser context)
  return 'http://localhost:5173/client-metadata.json'
}

const CLIENT_ID = getClientId()

let oauthClient: BrowserOAuthClient | null = null

/**
 * Initialize the OAuth client
 * Must be called before using any auth functions
 * @throws {Error} If the client metadata file cannot be loaded
 * @returns The initialized OAuth client
 */
export async function initializeOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) {
    return oauthClient
  }

  try {
    oauthClient = await BrowserOAuthClient.load({
      clientId: CLIENT_ID,
      handleResolver: 'https://bsky.social',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(
      `Failed to initialize OAuth client. Please ensure ${CLIENT_ID} is accessible. ${errorMessage}`
    )
  }

  return oauthClient
}

/**
 * Get the initialized OAuth client
 * @throws {Error} If the client has not been initialized
 * @returns The initialized OAuth client
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
 * @param handle - The Bluesky handle (e.g., username.bsky.social)
 * @throws {Error} If the login flow cannot be started
 */
export async function startLogin(handle: string): Promise<void> {
  const client = getOAuthClient()
  await client.signIn(handle, {
    scope: 'atproto transition:generic',
  })
}

/**
 * Check if the current URL is an OAuth callback
 * OAuth callbacks contain 'code' or 'error' parameters in either query string or hash
 * @returns True if this appears to be an OAuth callback
 */
export function isOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  
  return (
    params.has('code') ||
    params.has('error') ||
    hash.has('code') ||
    hash.has('error')
  )
}

/**
 * Handle the OAuth callback after authorization
 * Uses authorization code flow (code in query params) or implicit flow (code in hash)
 * @returns The session if successful, null if not a callback
 * @throws {Error} If the callback contains an error or processing fails
 */
export async function handleOAuthCallback(): Promise<OAuthSession | null> {
  if (!isOAuthCallback()) {
    return null
  }
  
  const client = getOAuthClient()
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.slice(1))
  
  // Check for OAuth errors first
  const errorParam = params.get('error') || hash.get('error')
  if (errorParam) {
    const errorDescription = params.get('error_description') || hash.get('error_description') || errorParam
    window.history.replaceState({}, '', window.location.pathname)
    throw new Error(`OAuth error: ${errorDescription}`)
  }
  
  try {
    // Use query params (authorization code flow) or hash (implicit flow)
    const callbackParams = params.has('code') ? params : hash
    const result = await client.callback(callbackParams)
    
    // Clear the URL parameters after handling
    window.history.replaceState({}, '', window.location.pathname)
    return result.session
  } catch (error) {
    // Clear the URL parameters even on error
    window.history.replaceState({}, '', window.location.pathname)
    throw error
  }
}

/**
 * Initialize auth from stored session
 * Attempts to restore a valid session from the OAuth client's internal storage
 * @returns The existing session if available and valid, null otherwise
 */
export async function initializeFromStorage(): Promise<OAuthSession | null> {
  const client = getOAuthClient()
  const result = await client.init()
  return result?.session ?? null
}

/**
 * Logout and clear the session
 * Signs out from the OAuth session and clears server-side state
 * @param session - The OAuth session to sign out from
 */
export async function logout(session: OAuthSession): Promise<void> {
  await session.signOut()
}

/**
 * Convert OAuthSession to AuthSession
 * Maps the OAuth session's 'sub' field (which contains the handle) to our AuthSession type
 * @param session - The OAuth session from @atproto/oauth-client-browser
 * @returns An AuthSession with did and handle
 */
export function toAuthSession(session: OAuthSession): AuthSession {
  return {
    did: session.did,
    handle: session.sub, // OAuth 'sub' field contains the handle
  }
}

/**
 * Storage key for persisting auth state
 */
export const AUTH_STORAGE_KEY = 'recipe-book-auth'

/**
 * Save auth session reference to localStorage
 * Note: This stores a reference to the session. The actual OAuth session
 * is managed by the OAuth client's internal storage. Both must be in sync.
 * @param session - The auth session to persist
 */
export function saveAuthState(session: AuthSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

/**
 * Load auth session reference from localStorage
 * @returns The stored auth session or null if not found or invalid
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
 * Note: This only clears the localStorage reference. The OAuth client's
 * internal session should be cleared via logout().
 */
export function clearAuthState(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
