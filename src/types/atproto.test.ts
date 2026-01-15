import { describe, it, expect } from 'vitest'
import type { AtProtoConfig, AtProtoSession } from './atproto'

describe('ATProto Types', () => {
  it('should define AtProtoConfig interface correctly', () => {
    const config: AtProtoConfig = {
      service: 'https://bsky.social',
    }

    expect(config.service).toBe('https://bsky.social')
  })

  it('should define AtProtoSession interface correctly', () => {
    const session: AtProtoSession = {
      did: 'did:plc:abc123',
      handle: 'test.bsky.social',
      accessJwt: 'access-token',
      refreshJwt: 'refresh-token',
    }

    expect(session.did).toBe('did:plc:abc123')
    expect(session.handle).toBe('test.bsky.social')
    expect(session.accessJwt).toBe('access-token')
    expect(session.refreshJwt).toBe('refresh-token')
  })
})
