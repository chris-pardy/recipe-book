# Collections Lexicon Definition

## Overview

The Collections lexicon (`dev.chrispardy.collections`) defines the schema for recipe collections stored in the user's Personal Data Server (PDS). Collections allow users to organize recipes into custom groups.

## Lexicon Schema

**Namespace:** `dev.chrispardy.collections`  
**Type:** Record  
**Location:** `lexicons/dev.chrispardy.collections.json`

## Record Schema

### Required Fields

- **name** (string, required)
  - The name of the collection
  - Must be a non-empty string
  - Maximum length: 100 characters
  - Example: `"My Favorite Recipes"`

- **recipeUris** (array of strings, required)
  - Array of recipe record URIs (ATProto URIs)
  - Each URI must be a valid ATProto URI pointing to a recipe record
  - Format: `at://did:plc:.../dev.chrispardy.recipes/rkey`
  - Maximum items: 1000
  - Can be empty array
  - Example: `["at://did:plc:abc123/dev.chrispardy.recipes/recipe-1"]`

- **createdAt** (string, required)
  - ISO 8601 timestamp indicating when the collection was created
  - Format: ISO 8601 datetime (e.g., `"2024-01-01T00:00:00.000Z"`)
  - Example: `"2024-01-01T12:30:45.123Z"`

- **updatedAt** (string, required)
  - ISO 8601 timestamp indicating when the collection was last updated
  - Format: ISO 8601 datetime (e.g., `"2024-01-01T00:00:00.000Z"`)
  - Must be equal to or after `createdAt`
  - Example: `"2024-01-02T15:45:30.456Z"`

### Optional Fields

- **description** (string, optional)
  - Optional description of the collection
  - Provides additional context about the collection's purpose or contents
  - Maximum length: 500 characters
  - Example: `"A collection of my favorite dessert recipes"`

## Validation Rules

1. **Name Validation**
   - Must be present and non-empty (after trimming whitespace)
   - Must be a string
   - Maximum 100 characters

2. **Description Validation**
   - If provided, must be a string
   - Maximum 500 characters
   - Can be an empty string

3. **Recipe URIs Validation**
   - Must be an array
   - Maximum 1000 items
   - Each item must be a valid ATProto URI
   - URI format: `at://did:plc:.../collection/rkey`

4. **Timestamp Validation**
   - Both `createdAt` and `updatedAt` must be valid ISO 8601 datetime strings
   - `updatedAt` must be equal to or after `createdAt`

## TypeScript Types

The TypeScript types are defined in `src/types/collection.ts`:

```typescript
export interface Collection {
  name: string
  description?: string
  recipeUris: string[]
  createdAt: string
  updatedAt: string
}

export interface CollectionRecord extends Collection {
  $type: 'dev.chrispardy.collections'
}
```

## Validation Functions

Validation utilities are available in `src/utils/collectionValidation.ts`:

- `validateCollection(collection: Collection): void` - Validates a Collection object
- `validateCollectionRecord(record: CollectionRecord): void` - Validates a CollectionRecord
- `createValidCollection(data): Collection` - Creates a valid Collection with current timestamps

## Example Record

```json
{
  "$type": "dev.chrispardy.collections",
  "name": "Dessert Recipes",
  "description": "A collection of my favorite dessert recipes",
  "recipeUris": [
    "at://did:plc:abc123/dev.chrispardy.recipes/chocolate-cake",
    "at://did:plc:abc123/dev.chrispardy.recipes/vanilla-ice-cream"
  ],
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-15T12:30:45.123Z"
}
```

## Default Collection

The application automatically creates a default collection named "my-saved recipes" when a user saves their first recipe. This collection serves as the default location for saved recipes.

## Use Cases

1. **Organizing Recipes**: Users can create custom collections to organize recipes by category (e.g., "Desserts", "Main Courses", "Vegetarian")
2. **Recipe Sharing**: Collections can contain both owned recipes (editable) and forked recipes (read-only references)
3. **Recipe Discovery**: Collections help users discover and group related recipes

## Technical Notes

- Collections are stored in the user's PDS, not just in IndexedDB
- Collections contain references to recipe URIs, not full recipe data
- A recipe can belong to multiple collections
- Collections are public (accessible via URL) like recipes
- The lexicon follows ATProto lexicon version 1 format

## Related Documentation

- [PRD.md](../../PRD.md) - Product Requirements Document
- [Collection Types](../../src/types/collection.ts) - TypeScript type definitions
- [Collection Validation](../../src/utils/collectionValidation.ts) - Validation utilities
