import { describe, it, expect } from 'vitest'
import type { Collection, CollectionRecord } from './collection'

describe('Collection Types', () => {
  it('should define Collection interface correctly', () => {
    const collection: Collection = {
      name: 'My Recipes',
      recipeUris: [
        'at://did:plc:123/dev.chrispardy.recipes/1',
        'at://did:plc:123/dev.chrispardy.recipes/2',
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(collection.name).toBe('My Recipes')
    expect(collection.recipeUris).toHaveLength(2)
  })

  it('should allow optional description in Collection', () => {
    const collection: Collection = {
      name: 'My Recipes',
      description: 'A collection of my favorite recipes',
      recipeUris: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(collection.description).toBe('A collection of my favorite recipes')
  })

  it('should define CollectionRecord with $type', () => {
    const record: CollectionRecord = {
      $type: 'dev.chrispardy.collections',
      name: 'My Recipes',
      recipeUris: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(record.$type).toBe('dev.chrispardy.collections')
  })
})
