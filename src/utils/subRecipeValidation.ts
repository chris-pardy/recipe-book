/**
 * Utility functions for sub-recipe validation and circular reference detection
 */

import type { Recipe } from '../types/recipe'
import { recipeDB } from '../services/indexeddb'

/**
 * Check if adding a sub-recipe would create a circular reference
 * 
 * @param parentRecipeUri - URI of the parent recipe
 * @param subRecipeUri - URI of the sub-recipe to add
 * @returns true if adding the sub-recipe would create a circular reference
 */
export async function wouldCreateCircularReference(
  parentRecipeUri: string,
  subRecipeUri: string,
): Promise<boolean> {
  // If trying to add self as sub-recipe, that's a circular reference
  if (parentRecipeUri === subRecipeUri) {
    return true
  }

  // Check if the sub-recipe (or any of its sub-recipes) references the parent
  const visited = new Set<string>()
  return await checkCircularReference(subRecipeUri, parentRecipeUri, visited)
}

/**
 * Recursively check if a recipe or any of its sub-recipes references a target recipe
 * 
 * @param currentRecipeUri - URI of the recipe to check
 * @param targetRecipeUri - URI of the recipe we're checking for (the parent)
 * @param visited - Set of visited recipe URIs to prevent infinite loops
 * @returns true if a circular reference would be created
 */
async function checkCircularReference(
  currentRecipeUri: string,
  targetRecipeUri: string,
  visited: Set<string>,
): Promise<boolean> {
  // Prevent infinite loops
  if (visited.has(currentRecipeUri)) {
    return false // Already checked this path
  }
  visited.add(currentRecipeUri)

  // If current recipe is the target, we have a circular reference
  if (currentRecipeUri === targetRecipeUri) {
    return true
  }

  // Get the current recipe
  const recipe = await recipeDB.get(currentRecipeUri)
  if (!recipe || !recipe.subRecipes || recipe.subRecipes.length === 0) {
    return false // No sub-recipes, no circular reference
  }

  // Check all sub-recipes recursively
  for (const subRecipeUri of recipe.subRecipes) {
    if (await checkCircularReference(subRecipeUri, targetRecipeUri, visited)) {
      return true
    }
  }

  return false
}

/**
 * Get all recipes that reference a given recipe as a sub-recipe
 * 
 * @param recipeUri - URI of the recipe to find parents for
 * @returns Array of recipe URIs that have this recipe as a sub-recipe
 */
export async function getParentRecipes(recipeUri: string): Promise<string[]> {
  const allRecipes = await recipeDB.getAll()
  const parentUris: string[] = []

  for (const recipe of allRecipes) {
    if (recipe.subRecipes && recipe.subRecipes.includes(recipeUri)) {
      parentUris.push(recipe.uri)
    }
  }

  return parentUris
}
