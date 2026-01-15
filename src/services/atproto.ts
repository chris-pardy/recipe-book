/**
 * ATProto service for interacting with Bluesky PDS
 * Uses @atproto/api for all PDS interactions
 */

import { BskyAgent } from '@atproto/api'
import type { AtProtoConfig, AtProtoSession } from '../types'
import type { Recipe, RecipeRecord } from '../types/recipe'
import type { Collection, CollectionRecord } from '../types/collection'

/**
 * Collection namespaces
 */
export const RECIPE_COLLECTION = 'dev.chrispardy.recipes'
export const COLLECTION_COLLECTION = 'dev.chrispardy.collections'

/**
 * Retry configuration
 */
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const RATE_LIMIT_DELAY_MS = 2000

/**
 * Error types
 */
export class AtProtoError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message)
    this.name = 'AtProtoError'
  }
}

export class RateLimitError extends AtProtoError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429)
    this.name = 'RateLimitError'
  }
}

export class NotFoundError extends AtProtoError {
  constructor(message = 'Record not found') {
    super(message, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class AuthenticationError extends AtProtoError {
  constructor(message = 'Not authenticated') {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if error is a rate limit error
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode === 429
  }
  return false
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true
  if (error instanceof AtProtoError && error.statusCode) {
    // Retry on 5xx errors and rate limits
    return error.statusCode >= 500 || error.statusCode === 429
  }
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode
    return statusCode >= 500 || statusCode === 429
  }
  return false
}

/**
 * Retry wrapper for ATProto operations
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!isRetryableError(error) || attempt === retries) {
        throw error
      }

      // Handle rate limiting with exponential backoff
      if (isRateLimitError(error)) {
        const delay = RATE_LIMIT_DELAY_MS * Math.pow(2, attempt)
        await sleep(delay)
      } else {
        // Exponential backoff for other retryable errors
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
        await sleep(delay)
      }
    }
  }

  throw lastError
}

/**
 * Ensure agent is authenticated
 */
function ensureAuthenticated(agent: BskyAgent): void {
  if (!agent.session) {
    throw new AuthenticationError()
  }
}

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

/**
 * Create a new recipe record in PDS
 */
export async function createRecipe(
  agent: BskyAgent,
  recipeData: Omit<Recipe, 'createdAt' | 'updatedAt'>,
): Promise<{ uri: string; cid: string }> {
  ensureAuthenticated(agent)

  const now = new Date().toISOString()
  const record: RecipeRecord = {
    $type: RECIPE_COLLECTION,
    ...recipeData,
    createdAt: now,
    updatedAt: now,
  }

  return withRetry(async () => {
    try {
      const response = await agent.com.atproto.repo.createRecord({
        repo: agent.session!.did,
        collection: RECIPE_COLLECTION,
        record: record,
      })

      return {
        uri: response.uri,
        cid: response.cid.toString(),
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to create recipe',
        'CREATE_ERROR',
      )
    }
  })
}

/**
 * Get a recipe record by URI
 */
export async function getRecipe(
  agent: BskyAgent,
  uri: string,
): Promise<RecipeRecord | null> {
  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid recipe URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== RECIPE_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a recipe collection',
          'INVALID_COLLECTION',
        )
      }

      const response = await agent.com.atproto.repo.getRecord({
        repo,
        collection,
        rkey,
      })

      return response.value as RecipeRecord
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          return null
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
      }
      if (error instanceof NotFoundError) {
        return null
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to get recipe',
        'GET_ERROR',
      )
    }
  })
}

/**
 * Update an existing recipe record
 */
export async function updateRecipe(
  agent: BskyAgent,
  uri: string,
  recipeData: Partial<Omit<Recipe, 'createdAt' | 'updatedAt'>>,
): Promise<{ uri: string; cid: string }> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid recipe URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== RECIPE_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a recipe collection',
          'INVALID_COLLECTION',
        )
      }

      // Get existing record to merge updates
      const existing = await agent.com.atproto.repo.getRecord({
        repo,
        collection,
        rkey,
      })

      const existingValue = existing.value as RecipeRecord
      const updatedRecord: RecipeRecord = {
        ...existingValue,
        ...recipeData,
        updatedAt: new Date().toISOString(),
      }

      const response = await agent.com.atproto.repo.putRecord({
        repo,
        collection,
        rkey,
        record: updatedRecord,
      })

      return {
        uri: response.uri,
        cid: response.cid.toString(),
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          throw new NotFoundError('Recipe not found')
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to update recipe',
        'UPDATE_ERROR',
      )
    }
  })
}

/**
 * Delete a recipe record
 */
export async function deleteRecipe(
  agent: BskyAgent,
  uri: string,
): Promise<void> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid recipe URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== RECIPE_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a recipe collection',
          'INVALID_COLLECTION',
        )
      }

      await agent.com.atproto.repo.deleteRecord({
        repo,
        collection,
        rkey,
      })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          throw new NotFoundError('Recipe not found')
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to delete recipe',
        'DELETE_ERROR',
      )
    }
  })
}

/**
 * List user's recipe records
 */
export async function listRecipes(
  agent: BskyAgent,
  limit = 50,
  cursor?: string,
): Promise<{
  records: RecipeRecord[]
  cursor?: string
}> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      const response = await agent.com.atproto.repo.listRecords({
        repo: agent.session!.did,
        collection: RECIPE_COLLECTION,
        limit,
        cursor,
      })

      return {
        records: response.records.map(
          record => record.value as RecipeRecord,
        ),
        cursor: response.cursor,
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to list recipes',
        'LIST_ERROR',
      )
    }
  })
}

/**
 * Create a new collection record in PDS
 */
export async function createCollection(
  agent: BskyAgent,
  collectionData: Omit<Collection, 'createdAt' | 'updatedAt'>,
): Promise<{ uri: string; cid: string }> {
  ensureAuthenticated(agent)

  const now = new Date().toISOString()
  const record: CollectionRecord = {
    $type: COLLECTION_COLLECTION,
    ...collectionData,
    createdAt: now,
    updatedAt: now,
  }

  return withRetry(async () => {
    try {
      const response = await agent.com.atproto.repo.createRecord({
        repo: agent.session!.did,
        collection: COLLECTION_COLLECTION,
        record: record,
      })

      return {
        uri: response.uri,
        cid: response.cid.toString(),
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error
          ? error.message
          : 'Failed to create collection',
        'CREATE_ERROR',
      )
    }
  })
}

/**
 * Get a collection record by URI
 */
export async function getCollection(
  agent: BskyAgent,
  uri: string,
): Promise<CollectionRecord | null> {
  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid collection URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== COLLECTION_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a collection collection',
          'INVALID_COLLECTION',
        )
      }

      const response = await agent.com.atproto.repo.getRecord({
        repo,
        collection,
        rkey,
      })

      return response.value as CollectionRecord
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          return null
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
      }
      if (error instanceof NotFoundError) {
        return null
      }
      throw new AtProtoError(
        error instanceof Error ? error.message : 'Failed to get collection',
        'GET_ERROR',
      )
    }
  })
}

/**
 * Update an existing collection record
 */
export async function updateCollection(
  agent: BskyAgent,
  uri: string,
  collectionData: Partial<Omit<Collection, 'createdAt' | 'updatedAt'>>,
): Promise<{ uri: string; cid: string }> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid collection URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== COLLECTION_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a collection collection',
          'INVALID_COLLECTION',
        )
      }

      // Get existing record to merge updates
      const existing = await agent.com.atproto.repo.getRecord({
        repo,
        collection,
        rkey,
      })

      const existingValue = existing.value as CollectionRecord
      const updatedRecord: CollectionRecord = {
        ...existingValue,
        ...collectionData,
        updatedAt: new Date().toISOString(),
      }

      const response = await agent.com.atproto.repo.putRecord({
        repo,
        collection,
        rkey,
        record: updatedRecord,
      })

      return {
        uri: response.uri,
        cid: response.cid.toString(),
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          throw new NotFoundError('Collection not found')
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error
          ? error.message
          : 'Failed to update collection',
        'UPDATE_ERROR',
      )
    }
  })
}

/**
 * Delete a collection record
 */
export async function deleteCollection(
  agent: BskyAgent,
  uri: string,
): Promise<void> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      // Parse URI to extract repo and rkey
      const uriParts = uri.replace('at://', '').split('/')
      if (uriParts.length < 3) {
        throw new AtProtoError('Invalid collection URI', 'INVALID_URI')
      }

      const repo = uriParts[0]
      const collection = uriParts[1]
      const rkey = uriParts[2]

      if (collection !== COLLECTION_COLLECTION) {
        throw new AtProtoError(
          'URI does not point to a collection collection',
          'INVALID_COLLECTION',
        )
      }

      await agent.com.atproto.repo.deleteRecord({
        repo,
        collection,
        rkey,
      })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 404) {
          throw new NotFoundError('Collection not found')
        }
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error
          ? error.message
          : 'Failed to delete collection',
        'DELETE_ERROR',
      )
    }
  })
}

/**
 * List user's collection records
 */
export async function listCollections(
  agent: BskyAgent,
  limit = 50,
  cursor?: string,
): Promise<{
  records: CollectionRecord[]
  cursor?: string
}> {
  ensureAuthenticated(agent)

  return withRetry(async () => {
    try {
      const response = await agent.com.atproto.repo.listRecords({
        repo: agent.session!.did,
        collection: COLLECTION_COLLECTION,
        limit,
        cursor,
      })

      return {
        records: response.records.map(
          record => record.value as CollectionRecord,
        ),
        cursor: response.cursor,
      }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode: number }).statusCode
        if (statusCode === 429) {
          throw new RateLimitError()
        }
        if (statusCode === 401 || statusCode === 403) {
          throw new AuthenticationError()
        }
      }
      throw new AtProtoError(
        error instanceof Error
          ? error.message
          : 'Failed to list collections',
        'LIST_ERROR',
      )
    }
  })
}
