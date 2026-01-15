/**
 * TypeScript types for ATProto API integration
 */

import type { BskyAgent } from '@atproto/api'

export interface AtProtoConfig {
  service: string // PDS service URL (e.g., 'https://bsky.social')
}

export interface AtProtoSession {
  did: string
  handle: string
  accessJwt: string
  refreshJwt: string
}

export type AtProtoAgent = BskyAgent
