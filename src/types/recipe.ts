/**
 * TypeScript types for Recipe Book application
 * Based on ATProto custom lexicon: dev.chrispardy.recipes
 */

export interface Ingredient {
  id: string
  name: string
  amount?: number
  unit?: string
}

export interface IngredientReference {
  ingredientId: string
  byteStart: number
  byteEnd: number
  amount?: number
  unit?: string
}

export interface CookTime {
  duration: number // in minutes
  byteStart: number
  byteEnd: number
}

export interface StepMetadata {
  ingredientReferences?: IngredientReference[]
  cookTime?: CookTime
}

export interface Step {
  id: string
  text: string // Natural language: "mix 240g flour, 60g sugar"
  metadata?: StepMetadata
  order: number
}

export interface Recipe {
  title: string
  servings: number
  ingredients: Ingredient[]
  steps: Step[]
  subRecipes?: string[] // Array of recipe record URIs
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

/**
 * Fork metadata for recipes that are copies of recipes owned by other users
 */
export interface ForkMetadata {
  originalRecipeUri: string // URI of the original recipe
  originalAuthorDid: string // DID of the original recipe author
  forkedAt: string // ISO timestamp when the recipe was forked
}

/**
 * ATProto record representation of a Recipe
 */
export interface RecipeRecord extends Recipe {
  $type: 'dev.chrispardy.recipes'
}
