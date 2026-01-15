import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAtProtoAgent, authenticateAgent, getDefaultService } from './atproto'
import type { AtProtoSession } from '../types'

// Mock @atproto/api
vi.mock('@atproto/api', () => {
  class MockBskyAgent {
    service: string
    session: any = null

    constructor(config: { service: string }) {
      this.service = config.service
      this.session = null
    }
  }

  return {
    BskyAgent: MockBskyAgent,
  }
})

describe('ATProto Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createAtProtoAgent', () => {
    it('should create an agent with the correct service URL', () => {
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })

      expect(agent.service).toBe('https://bsky.social')
      expect(agent).toBeDefined()
    })
  })

  describe('authenticateAgent', () => {
    it('should set session on agent', () => {
      const { BskyAgent } = require('@atproto/api')
      const agent = createAtProtoAgent({ service: 'https://bsky.social' })

      const session: AtProtoSession = {
        did: 'did:plc:abc123',
        handle: 'test.bsky.social',
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
      }

      authenticateAgent(agent, session)

      expect(agent.session).toEqual({
        did: 'did:plc:abc123',
        handle: 'test.bsky.social',
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
      })
    })
  })

  describe('getDefaultService', () => {
    it('should return the default Bluesky service URL', () => {
      const service = getDefaultService()
      expect(service).toBe('https://bsky.social')
    })
  })
})
