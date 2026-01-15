import { describe, it, expect } from 'vitest'
import {
  validateCollection,
  validateCollectionRecord,
  createValidCollection,
  CollectionValidationError,
} from './collectionValidation'
import type { Collection, CollectionRecord } from '../types/collection'

describe('collectionValidation', () => {
  const validCollection: Collection = {
    name: 'My Recipes',
    description: 'A collection of my favorite recipes',
    recipeUris: [
      'at://did:plc:123/dev.chrispardy.recipes/1',
      'at://did:plc:123/dev.chrispardy.recipes/2',
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }

  describe('validateCollection', () => {
    it('should validate a valid collection', () => {
      expect(() => validateCollection(validCollection)).not.toThrow()
    })

    it('should validate a collection without description', () => {
      const collection: Collection = {
        ...validCollection,
        description: undefined,
      }
      expect(() => validateCollection(collection)).not.toThrow()
    })

    it('should validate a collection with empty recipeUris array', () => {
      const collection: Collection = {
        ...validCollection,
        recipeUris: [],
      }
      expect(() => validateCollection(collection)).not.toThrow()
    })

    describe('name validation', () => {
      it('should throw if name is missing', () => {
        const collection = { ...validCollection, name: undefined as unknown as string }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('name is required')
      })

      it('should throw if name is not a string', () => {
        const collection = { ...validCollection, name: 123 as unknown as string }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('name')
      })

      it('should throw if name is empty', () => {
        const collection: Collection = {
          ...validCollection,
          name: '',
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('name cannot be empty')
      })

      it('should throw if name is only whitespace', () => {
        const collection: Collection = {
          ...validCollection,
          name: '   ',
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('name cannot be empty')
      })

      it('should throw if name exceeds 100 characters', () => {
        const collection: Collection = {
          ...validCollection,
          name: 'a'.repeat(101),
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('name must be 100 characters or less')
      })

      it('should accept name with exactly 100 characters', () => {
        const collection: Collection = {
          ...validCollection,
          name: 'a'.repeat(100),
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })
    })

    describe('description validation', () => {
      it('should accept undefined description', () => {
        const collection: Collection = {
          ...validCollection,
          description: undefined,
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should throw if description is not a string', () => {
        const collection = {
          ...validCollection,
          description: 123 as unknown as string,
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('description')
      })

      it('should throw if description exceeds 500 characters', () => {
        const collection: Collection = {
          ...validCollection,
          description: 'a'.repeat(501),
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow(
          'description must be 500 characters or less',
        )
      })

      it('should accept description with exactly 500 characters', () => {
        const collection: Collection = {
          ...validCollection,
          description: 'a'.repeat(500),
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should accept empty description string', () => {
        const collection: Collection = {
          ...validCollection,
          description: '',
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })
    })

    describe('recipeUris validation', () => {
      it('should throw if recipeUris is missing', () => {
        const collection = {
          ...validCollection,
          recipeUris: undefined as unknown as string[],
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('recipeUris must be an array')
      })

      it('should throw if recipeUris is not an array', () => {
        const collection = {
          ...validCollection,
          recipeUris: 'not an array' as unknown as string[],
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('recipeUris must be an array')
      })

      it('should throw if recipeUris exceeds 1000 items', () => {
        const collection: Collection = {
          ...validCollection,
          recipeUris: Array.from({ length: 1001 }, (_, i) =>
            `at://did:plc:123/dev.chrispardy.recipes/${i}`,
          ),
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow(
          'recipeUris array cannot contain more than 1000 items',
        )
      })

      it('should accept recipeUris with exactly 1000 items', () => {
        const collection: Collection = {
          ...validCollection,
          recipeUris: Array.from({ length: 1000 }, (_, i) =>
            `at://did:plc:123/dev.chrispardy.recipes/${i}`,
          ),
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should throw if recipeUris contains non-string items', () => {
        const collection = {
          ...validCollection,
          recipeUris: ['at://did:plc:123/dev.chrispardy.recipes/1', 123] as unknown as string[],
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('recipeUris[1] must be a string')
      })

      it('should throw if recipeUris contains invalid ATProto URIs', () => {
        const collection: Collection = {
          ...validCollection,
          recipeUris: ['invalid-uri', 'also-invalid'],
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('must be a valid ATProto URI')
      })

      it('should throw if recipeUris contains URIs without did: prefix', () => {
        const collection: Collection = {
          ...validCollection,
          recipeUris: ['at://not-a-did/collection/rkey'],
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('must be a valid ATProto URI')
      })

      it('should accept valid ATProto URIs', () => {
        const collection: Collection = {
          ...validCollection,
          recipeUris: [
            'at://did:plc:abc123/dev.chrispardy.recipes/recipe-1',
            'at://did:plc:xyz789/com.example.recipes/recipe-2',
          ],
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })
    })

    describe('createdAt validation', () => {
      it('should throw if createdAt is missing', () => {
        const collection = {
          ...validCollection,
          createdAt: undefined as unknown as string,
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('createdAt is required')
      })

      it('should throw if createdAt is not a string', () => {
        const collection = {
          ...validCollection,
          createdAt: 123 as unknown as string,
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('createdAt')
      })

      it('should throw if createdAt is not a valid ISO datetime', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: 'not-a-date',
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('createdAt must be a valid ISO 8601')
      })

      it('should accept valid ISO datetime strings with milliseconds', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-01T12:30:45.123Z',
          updatedAt: '2024-01-01T12:30:45.123Z', // Must be >= createdAt
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should accept valid ISO datetime strings without milliseconds', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-01T12:30:45Z',
          updatedAt: '2024-01-01T12:30:45Z', // Must be >= createdAt
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })
    })

    describe('updatedAt validation', () => {
      it('should throw if updatedAt is missing', () => {
        const collection = {
          ...validCollection,
          updatedAt: undefined as unknown as string,
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('updatedAt is required')
      })

      it('should throw if updatedAt is not a string', () => {
        const collection = {
          ...validCollection,
          updatedAt: 123 as unknown as string,
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('updatedAt')
      })

      it('should throw if updatedAt is not a valid ISO datetime', () => {
        const collection: Collection = {
          ...validCollection,
          updatedAt: 'not-a-date',
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow('updatedAt must be a valid ISO 8601')
      })

      it('should throw if updatedAt is before createdAt', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }
        expect(() => validateCollection(collection)).toThrow(CollectionValidationError)
        expect(() => validateCollection(collection)).toThrow(
          'updatedAt cannot be before createdAt',
        )
      })

      it('should accept updatedAt equal to createdAt', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should accept updatedAt after createdAt', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })

      it('should accept ISO datetime strings without milliseconds for updatedAt', () => {
        const collection: Collection = {
          ...validCollection,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        }
        expect(() => validateCollection(collection)).not.toThrow()
      })
    })
  })

  describe('validateCollectionRecord', () => {
    it('should validate a valid collection record', () => {
      const record: CollectionRecord = {
        $type: 'dev.chrispardy.collections',
        ...validCollection,
      }
      expect(() => validateCollectionRecord(record)).not.toThrow()
    })

    it('should throw if $type is incorrect', () => {
      const record = {
        $type: 'dev.chrispardy.recipes',
        ...validCollection,
      } as CollectionRecord

      expect(() => validateCollectionRecord(record)).toThrow(CollectionValidationError)
      expect(() => validateCollectionRecord(record)).toThrow('Invalid $type')
    })

    it('should validate all collection fields in addition to $type', () => {
      const record = {
        $type: 'dev.chrispardy.collections',
        ...validCollection,
        name: '', // Invalid name
      } as CollectionRecord

      expect(() => validateCollectionRecord(record)).toThrow(CollectionValidationError)
      expect(() => validateCollectionRecord(record)).toThrow('name cannot be empty')
    })
  })

  describe('createValidCollection', () => {
    it('should create a valid collection with current timestamps', () => {
      const before = new Date()
      const collection = createValidCollection({
        name: 'Test Collection',
        recipeUris: ['at://did:plc:123/dev.chrispardy.recipes/1'],
      })
      const after = new Date()

      expect(collection.name).toBe('Test Collection')
      expect(collection.recipeUris).toHaveLength(1)
      expect(collection.createdAt).toBeDefined()
      expect(collection.updatedAt).toBeDefined()

      const createdAt = new Date(collection.createdAt)
      const updatedAt = new Date(collection.updatedAt)

      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(createdAt.getTime()).toBe(updatedAt.getTime())
    })

    it('should use empty array for recipeUris if not provided', () => {
      const collection = createValidCollection({
        name: 'Test Collection',
      })

      expect(collection.recipeUris).toEqual([])
    })

    it('should include description if provided', () => {
      const collection = createValidCollection({
        name: 'Test Collection',
        description: 'Test description',
        recipeUris: [],
      })

      expect(collection.description).toBe('Test description')
    })

    it('should throw if provided data is invalid', () => {
      expect(() =>
        createValidCollection({
          name: '', // Invalid: empty name
          recipeUris: [],
        }),
      ).toThrow(CollectionValidationError)
    })

    it('should create a collection that passes validation', () => {
      const collection = createValidCollection({
        name: 'Test Collection',
        description: 'Test',
        recipeUris: ['at://did:plc:123/dev.chrispardy.recipes/1'],
      })

      expect(() => validateCollection(collection)).not.toThrow()
    })
  })
})
