/**
 * Helper functions for creating authenticated ATProto agents
 */

import { BskyAgent } from '@atproto/api'
import { getOAuthClient } from './auth'
import { createAtProtoAgent, authenticateAgent, getDefaultService } from './atproto'
import type { AtProtoSession } from '../types/atproto'

/**
 * Get an authenticated ATProto agent from the current OAuth session
 * @returns An authenticated BskyAgent, or null if not authenticated
 * @throws {Error} If the OAuth client is not initialized
 */
export async function getAuthenticatedAgent(): Promise<BskyAgent | null> {
  try {
    const oauthClient = getOAuthClient()
    const result = await oauthClient.init()
    
    if (!result?.session) {
      return null
    }

    const agent = createAtProtoAgent({ service: getDefaultService() })
    
    // The OAuth session should have the tokens we need
    // We need to extract them from the session
    const session: AtProtoSession = {
      did: result.session.did,
      handle: result.session.sub,
      // @ts-expect-error - OAuthSession may have these properties
      accessJwt: result.session.accessJwt || '',
      // @ts-expect-error - OAuthSession may have these properties
      refreshJwt: result.session.refreshJwt || '',
    }

    await authenticateAgent(agent, session)
    return agent
  } catch (error) {
    console.error('Failed to get authenticated agent:', error)
    return null
  }
}
