/**
 * TypeScript types for Collections
 * Based on ATProto custom lexicon: dev.chrispardy.collections
 */

export interface Collection {
  name: string
  description?: string
  recipeUris: string[] // Array of recipe record URIs
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

/**
 * ATProto record representation of a Collection
 */
export interface CollectionRecord extends Collection {
  $type: 'dev.chrispardy.collections'
}
