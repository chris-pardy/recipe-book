/**
 * TypeScript types for Collections
 * Based on ATProto custom lexicon: dev.chrispardy.collections
 * 
 * Lexicon definition: lexicons/dev.chrispardy.collections.json
 * 
 * Collections allow users to organize recipes into custom groups.
 * Collections are stored in the user's PDS and can contain references
 * to both owned and forked recipes.
 */

/**
 * Collection interface matching the ATProto lexicon schema
 * 
 * @property name - The name of the collection (required, max 100 characters)
 * @property description - Optional description of the collection (max 500 characters)
 * @property recipeUris - Array of recipe record URIs (ATProto URIs, max 1000 items)
 * @property createdAt - ISO 8601 timestamp indicating when the collection was created
 * @property updatedAt - ISO 8601 timestamp indicating when the collection was last updated
 */
export interface Collection {
  /** Collection name (required, non-empty, max 100 characters) */
  name: string
  /** Optional description (max 500 characters) */
  description?: string
  /** Array of recipe record URIs (ATProto URIs, max 1000 items) */
  recipeUris: string[]
  /** ISO 8601 timestamp indicating when the collection was created */
  createdAt: string
  /** ISO 8601 timestamp indicating when the collection was last updated */
  updatedAt: string
}

/**
 * ATProto record representation of a Collection
 * Includes the $type field required for ATProto records
 */
export interface CollectionRecord extends Collection {
  /** ATProto record type identifier */
  $type: 'dev.chrispardy.collections'
}
