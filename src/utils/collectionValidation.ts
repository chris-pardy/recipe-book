/**
 * Validation utilities for Collection records
 * Validates collections against the ATProto lexicon schema: dev.chrispardy.collections
 */

import type { Collection, CollectionRecord } from '../types/collection'

/**
 * Validation error for collection records
 */
export class CollectionValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'CollectionValidationError'
  }
}

/**
 * Validates that a string is a valid ATProto URI
 * Validates that the URI has the correct structure and that the first segment is a DID
 * @internal - Internal utility function, not exported
 */
function isValidAtProtoUri(uri: string): boolean {
  if (!uri.startsWith('at://')) {
    return false
  }
  const uriParts = uri.replace('at://', '').split('/')
  if (uriParts.length < 3) {
    return false
  }
  // Validate that the first part is a DID
  return uriParts[0].startsWith('did:')
}

/**
 * Validates that a string is a valid ISO 8601 datetime
 * Accepts ISO strings with or without milliseconds
 * @internal - Internal utility function, not exported
 */
function isValidIsoDateTime(dateString: string): boolean {
  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return false
  }
  // Check if it's a valid ISO 8601 format (more flexible - accepts with or without milliseconds)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(dateString)
}

/**
 * Validates a Collection record against the lexicon schema
 * @param collection - The collection to validate
 * @throws CollectionValidationError if validation fails
 */
export function validateCollection(collection: Collection): void {
  // Validate name (required, non-empty, max 100 characters)
  if (collection.name === undefined || collection.name === null) {
    throw new CollectionValidationError(
      'Collection name is required and must be a string',
      'name',
    )
  }

  if (typeof collection.name !== 'string') {
    throw new CollectionValidationError(
      'Collection name is required and must be a string',
      'name',
    )
  }

  if (collection.name.trim().length === 0) {
    throw new CollectionValidationError(
      'Collection name cannot be empty',
      'name',
    )
  }

  if (collection.name.length > 100) {
    throw new CollectionValidationError(
      'Collection name must be 100 characters or less',
      'name',
    )
  }

  // Validate description (optional, max 500 characters if provided)
  if (collection.description !== undefined) {
    if (typeof collection.description !== 'string') {
      throw new CollectionValidationError(
        'Collection description must be a string',
        'description',
      )
    }

    if (collection.description.length > 500) {
      throw new CollectionValidationError(
        'Collection description must be 500 characters or less',
        'description',
      )
    }
  }

  // Validate recipeUris (required, array, max 1000 items)
  if (!Array.isArray(collection.recipeUris)) {
    throw new CollectionValidationError(
      'recipeUris must be an array',
      'recipeUris',
    )
  }

  if (collection.recipeUris.length > 1000) {
    throw new CollectionValidationError(
      'recipeUris array cannot contain more than 1000 items',
      'recipeUris',
    )
  }

  // Validate each URI in recipeUris
  for (let i = 0; i < collection.recipeUris.length; i++) {
    const uri = collection.recipeUris[i]
    if (typeof uri !== 'string') {
      throw new CollectionValidationError(
        `recipeUris[${i}] must be a string`,
        'recipeUris',
      )
    }

    if (!isValidAtProtoUri(uri)) {
      throw new CollectionValidationError(
        `recipeUris[${i}] must be a valid ATProto URI (format: at://did:plc:.../collection/rkey)`,
        'recipeUris',
      )
    }
  }

  // Validate createdAt (required, ISO 8601 datetime)
  if (!collection.createdAt || typeof collection.createdAt !== 'string') {
    throw new CollectionValidationError(
      'createdAt is required and must be a string',
      'createdAt',
    )
  }

  if (!isValidIsoDateTime(collection.createdAt)) {
    throw new CollectionValidationError(
      'createdAt must be a valid ISO 8601 datetime string',
      'createdAt',
    )
  }

  // Validate updatedAt (required, ISO 8601 datetime)
  if (!collection.updatedAt || typeof collection.updatedAt !== 'string') {
    throw new CollectionValidationError(
      'updatedAt is required and must be a string',
      'updatedAt',
    )
  }

  if (!isValidIsoDateTime(collection.updatedAt)) {
    throw new CollectionValidationError(
      'updatedAt must be a valid ISO 8601 datetime string',
      'updatedAt',
    )
  }

  // Validate that updatedAt is not before createdAt
  const createdAt = new Date(collection.createdAt)
  const updatedAt = new Date(collection.updatedAt)

  if (updatedAt < createdAt) {
    throw new CollectionValidationError(
      'updatedAt cannot be before createdAt',
      'updatedAt',
    )
  }
}

/**
 * Validates a CollectionRecord (includes $type field)
 * @param record - The collection record to validate
 * @throws CollectionValidationError if validation fails
 */
export function validateCollectionRecord(record: CollectionRecord): void {
  // Validate $type field
  if (record.$type !== 'dev.chrispardy.collections') {
    throw new CollectionValidationError(
      `Invalid $type: expected 'dev.chrispardy.collections', got '${record.$type}'`,
      '$type',
    )
  }

  // Validate the collection data
  validateCollection(record)
}

/**
 * Creates a valid Collection with default timestamps
 * @param data - Collection data (without timestamps)
 * @returns A valid Collection with createdAt and updatedAt set to current time
 */
export function createValidCollection(
  data: Omit<Collection, 'createdAt' | 'updatedAt'>,
): Collection {
  const now = new Date().toISOString()

  const collection: Collection = {
    ...data,
    recipeUris: data.recipeUris || [],
    createdAt: now,
    updatedAt: now,
  }

  validateCollection(collection)
  return collection
}
