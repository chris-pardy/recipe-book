import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAuthenticatedAgent } from './agent'
import { getOAuthClient } from './auth'
import { createAtProtoAgent, authenticateAgent } from './atproto'

// Mock dependencies
vi.mock('./auth')
vi.mock('./atproto')

describe('agent', () => {
  const mockOAuthSession = {
    did: 'did:plc:user123',
    sub: 'test.bsky.social',
    accessJwt: 'access-token',
    refreshJwt: 'refresh-token',
  }

  const mockAgent = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createAtProtoAgent).mockReturnValue(mockAgent)
    vi.mocked(authenticateAgent).mockResolvedValue(undefined)
  })

  it('should return authenticated agent when session exists', async () => {
    const mockOAuthClient = {
      init: vi.fn().mockResolvedValue({ session: mockOAuthSession }),
    }
    vi.mocked(getOAuthClient).mockReturnValue(mockOAuthClient as any)

    const agent = await getAuthenticatedAgent()

    expect(agent).toBe(mockAgent)
    expect(createAtProtoAgent).toHaveBeenCalled()
    expect(authenticateAgent).toHaveBeenCalledWith(mockAgent, {
      did: mockOAuthSession.did,
      handle: mockOAuthSession.sub,
      accessJwt: mockOAuthSession.accessJwt,
      refreshJwt: mockOAuthSession.refreshJwt,
    })
  })

  it('should return null when no session exists', async () => {
    const mockOAuthClient = {
      init: vi.fn().mockResolvedValue({ session: null }),
    }
    vi.mocked(getOAuthClient).mockReturnValue(mockOAuthClient as any)

    const agent = await getAuthenticatedAgent()

    expect(agent).toBeNull()
    expect(createAtProtoAgent).not.toHaveBeenCalled()
  })

  it('should return null when init returns undefined', async () => {
    const mockOAuthClient = {
      init: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(getOAuthClient).mockReturnValue(mockOAuthClient as any)

    const agent = await getAuthenticatedAgent()

    expect(agent).toBeNull()
  })

  it('should handle errors gracefully', async () => {
    const mockOAuthClient = {
      init: vi.fn().mockRejectedValue(new Error('Init failed')),
    }
    vi.mocked(getOAuthClient).mockReturnValue(mockOAuthClient as any)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const agent = await getAuthenticatedAgent()

    expect(agent).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
