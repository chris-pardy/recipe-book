/**
 * Service for deleting recipes with full cleanup
 * Handles deletion from PDS, IndexedDB, and removal from all collections
 */

import type { BskyAgent } from '@atproto/api'
import { deleteRecipe } from './atproto'
import { recipeDB, collectionDB } from './indexeddb'
import { listCollections, updateCollection } from './atproto'
import type { Collection } from '../types/collection'

/**
 * Delete a recipe completely:
 * 1. Delete from PDS
 * 2. Remove from IndexedDB cache
 * 3. Remove from all collections (both in PDS and IndexedDB)
 * 
 * @param agent - Authenticated ATProto agent
 * @param recipeUri - URI of the recipe to delete
 * @throws {Error} If deletion fails at any step
 */
export async function deleteRecipeComplete(
  agent: BskyAgent,
  recipeUri: string,
): Promise<void> {
  // Step 1: Remove recipe from all collections
  // Get all collections from IndexedDB first (faster than PDS)
  const allCollections = await collectionDB.getAll()
  
  // Filter collections that contain this recipe
  const collectionsToUpdate = allCollections.filter((collection) =>
    collection.recipeUris.includes(recipeUri),
  )

  // Update each collection to remove the recipe URI
  for (const collection of collectionsToUpdate) {
    const updatedRecipeUris = collection.recipeUris.filter(
      (uri) => uri !== recipeUri,
    )
    
    // Update in PDS
    await updateCollection(agent, collection.uri, {
      recipeUris: updatedRecipeUris,
    })
    
    // Update in IndexedDB
    await collectionDB.put(collection.uri, {
      ...collection,
      recipeUris: updatedRecipeUris,
    })
  }

  // Step 2: Delete from PDS
  await deleteRecipe(agent, recipeUri)

  // Step 3: Remove from IndexedDB cache
  await recipeDB.delete(recipeUri)
}
