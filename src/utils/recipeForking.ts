/**
 * Utility functions for recipe forking
 */

import type { ForkMetadata } from '../types/recipe'
import { getDidFromUri } from './recipeOwnership'

/**
 * Check if a recipe is a fork (copy of another user's recipe)
 * @param recipe - The recipe object (from IndexedDB with forkMetadata)
 * @returns true if the recipe is a fork, false otherwise
 */
export function isRecipeForked(
  recipe: { forkMetadata?: ForkMetadata } | null | undefined,
): boolean {
  return recipe?.forkMetadata !== undefined
}

/**
 * Get fork metadata from a recipe
 * @param recipe - The recipe object (from IndexedDB with forkMetadata)
 * @returns Fork metadata if the recipe is forked, null otherwise
 */
export function getForkMetadata(
  recipe: { forkMetadata?: ForkMetadata } | null | undefined,
): ForkMetadata | null {
  return recipe?.forkMetadata || null
}

/**
 * Create fork metadata for a recipe
 * @param originalRecipeUri - The URI of the original recipe
 * @returns Fork metadata object
 */
export function createForkMetadata(originalRecipeUri: string): ForkMetadata {
  const originalAuthorDid = getDidFromUri(originalRecipeUri)
  if (!originalAuthorDid) {
    throw new Error(`Invalid recipe URI: ${originalRecipeUri}`)
  }

  return {
    originalRecipeUri,
    originalAuthorDid,
    forkedAt: new Date().toISOString(),
  }
}
