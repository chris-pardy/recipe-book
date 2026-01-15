/**
 * ATProto service for interacting with Bluesky PDS
 * Uses @atproto/api for all PDS interactions
 */

import { BskyAgent } from '@atproto/api'
import type { AtProtoConfig, AtProtoSession } from '../types'

/**
 * Create and configure an ATProto agent
 */
export function createAtProtoAgent(config: AtProtoConfig): BskyAgent {
  return new BskyAgent({
    service: config.service,
  })
}

/**
 * Authenticate with ATProto using session
 */
export async function authenticateAgent(
  agent: BskyAgent,
  session: AtProtoSession,
): Promise<void> {
  agent.session = {
    did: session.did,
    handle: session.handle,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
  }
}

/**
 * Get the default ATProto service URL (Bluesky)
 */
export function getDefaultService(): string {
  return 'https://bsky.social'
}
