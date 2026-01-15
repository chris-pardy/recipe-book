/**
 * Collections service for managing recipe collections
 * Handles both PDS and IndexedDB operations for collections
 */

import { BskyAgent } from '@atproto/api'
import { getAuthenticatedAgent } from './agent'
import {
  createCollection,
  updateCollection,
  deleteCollection,
  getCollection,
} from './atproto'
import { collectionDB } from './indexeddb'
import type { Collection } from '../types/collection'

/**
 * Default collection name
 */
export const DEFAULT_COLLECTION_NAME = 'my-saved recipes'

/**
 * Error class for collection operations
 */
export class CollectionError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'CollectionError'
  }
}

/**
 * Get or create the default collection
 * Creates it if it doesn't exist
 */
export async function getOrCreateDefaultCollection(
  agent: BskyAgent,
): Promise<{ uri: string; collection: Collection }> {
  try {
    // First check IndexedDB
    const allCollections = await collectionDB.getAll()
    const defaultCollection = allCollections.find(
      (c) => c.name === DEFAULT_COLLECTION_NAME,
    )

    if (defaultCollection) {
      return {
        uri: defaultCollection.uri,
        collection: defaultCollection,
      }
    }

    // If not in IndexedDB, check PDS
    // We need to get the full records with URIs
    const response = await agent.com.atproto.repo.listRecords({
      repo: agent.session!.did,
      collection: 'dev.chrispardy.collections',
      limit: 100,
    })
    const recordWithUri = response.records.find(
      (r) => (r.value as Collection).name === DEFAULT_COLLECTION_NAME
    )

    if (recordWithUri) {
      const pdsDefault = recordWithUri.value as Collection
      // Cache in IndexedDB
      await collectionDB.put(recordWithUri.uri, pdsDefault, recordWithUri.cid)
      return {
        uri: recordWithUri.uri,
        collection: pdsDefault,
      }
    }

    // Create default collection if it doesn't exist
    const newCollection: Omit<Collection, 'createdAt' | 'updatedAt'> = {
      name: DEFAULT_COLLECTION_NAME,
      description: 'My saved recipes',
      recipeUris: [],
    }

    const result = await createCollection(agent, newCollection)
    const createdCollection: Collection = {
      ...newCollection,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Cache in IndexedDB
    await collectionDB.put(result.uri, createdCollection, result.cid)

    return {
      uri: result.uri,
      collection: createdCollection,
    }
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to get or create default collection',
      'GET_OR_CREATE_DEFAULT_ERROR',
    )
  }
}

/**
 * Create a new collection
 */
export async function createNewCollection(
  agent: BskyAgent,
  name: string,
  description?: string,
): Promise<{ uri: string; cid: string }> {
  if (!name.trim()) {
    throw new CollectionError('Collection name is required', 'VALIDATION_ERROR')
  }

  try {
    const collectionData: Omit<Collection, 'createdAt' | 'updatedAt'> = {
      name: name.trim(),
      description: description?.trim(),
      recipeUris: [],
    }

    const result = await createCollection(agent, collectionData)
    const createdCollection: Collection = {
      ...collectionData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Cache in IndexedDB
    await collectionDB.put(result.uri, createdCollection, result.cid)

    return result
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to create collection',
      'CREATE_ERROR',
    )
  }
}

/**
 * Add a recipe to a collection
 */
export async function addRecipeToCollection(
  agent: BskyAgent,
  collectionUri: string,
  recipeUri: string,
): Promise<void> {
  try {
    // Get existing collection
    const existing = await collectionDB.get(collectionUri)
    if (!existing) {
      // Try fetching from PDS
      const pdsCollection = await getCollection(agent, collectionUri)
      if (!pdsCollection) {
        throw new CollectionError('Collection not found', 'NOT_FOUND')
      }
      // Cache it (cid not available from getCollection, so we pass undefined)
      await collectionDB.put(collectionUri, pdsCollection, undefined)
    }

    const collection = existing || (await collectionDB.get(collectionUri))!
    if (!collection) {
      throw new CollectionError('Collection not found', 'NOT_FOUND')
    }

    // Check if recipe is already in collection
    if (collection.recipeUris.includes(recipeUri)) {
      return // Already in collection, no-op
    }

    // Update collection
    const updatedCollection: Collection = {
      ...collection,
      recipeUris: [...collection.recipeUris, recipeUri],
      updatedAt: new Date().toISOString(),
    }

    // Update in PDS
    const result = await updateCollection(agent, collectionUri, {
      recipeUris: updatedCollection.recipeUris,
    })

    // Update in IndexedDB
    await collectionDB.put(collectionUri, updatedCollection, result.cid)
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to add recipe to collection',
      'ADD_RECIPE_ERROR',
    )
  }
}

/**
 * Remove a recipe from a collection
 */
export async function removeRecipeFromCollection(
  agent: BskyAgent,
  collectionUri: string,
  recipeUri: string,
): Promise<void> {
  try {
    // Get existing collection
    const existing = await collectionDB.get(collectionUri)
    if (!existing) {
      // Try fetching from PDS
      const pdsCollection = await getCollection(agent, collectionUri)
      if (!pdsCollection) {
        throw new CollectionError('Collection not found', 'NOT_FOUND')
      }
      // Cache it (cid not available from getCollection, so we pass undefined)
      await collectionDB.put(collectionUri, pdsCollection, undefined)
    }

    const collection = existing || (await collectionDB.get(collectionUri))!
    if (!collection) {
      throw new CollectionError('Collection not found', 'NOT_FOUND')
    }

    // Check if recipe is in collection
    if (!collection.recipeUris.includes(recipeUri)) {
      return // Not in collection, no-op
    }

    // Update collection
    const updatedCollection: Collection = {
      ...collection,
      recipeUris: collection.recipeUris.filter((uri) => uri !== recipeUri),
      updatedAt: new Date().toISOString(),
    }

    // Update in PDS
    const result = await updateCollection(agent, collectionUri, {
      recipeUris: updatedCollection.recipeUris,
    })

    // Update in IndexedDB
    await collectionDB.put(collectionUri, updatedCollection, result.cid)
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to remove recipe from collection',
      'REMOVE_RECIPE_ERROR',
    )
  }
}

/**
 * Delete a collection
 */
export async function deleteCollectionComplete(
  agent: BskyAgent,
  collectionUri: string,
): Promise<void> {
  try {
    // Delete from PDS
    await deleteCollection(agent, collectionUri)

    // Delete from IndexedDB
    await collectionDB.delete(collectionUri)
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to delete collection',
      'DELETE_ERROR',
    )
  }
}

/**
 * Get all collections that contain a recipe
 */
export async function getCollectionsForRecipe(
  recipeUri: string,
): Promise<(Collection & { uri: string })[]> {
  try {
    const allCollections = await collectionDB.getAll()
    return allCollections.filter((collection) =>
      collection.recipeUris.includes(recipeUri),
    )
  } catch (error) {
    throw new CollectionError(
      error instanceof Error
        ? error.message
        : 'Failed to get collections for recipe',
      'GET_COLLECTIONS_ERROR',
    )
  }
}

/**
 * Ensure a recipe is added to the default collection
 * This is called when a recipe is created or added to "My Recipes"
 */
export async function ensureRecipeInDefaultCollection(
  recipeUri: string,
): Promise<void> {
  try {
    const agent = await getAuthenticatedAgent()
    if (!agent) {
      // Not authenticated, skip
      return
    }

    const { uri: defaultCollectionUri } = await getOrCreateDefaultCollection(
      agent,
    )
    await addRecipeToCollection(agent, defaultCollectionUri, recipeUri)
  } catch (error) {
    // Log error but don't throw - this is a convenience feature
    console.error('Failed to add recipe to default collection:', error)
  }
}
