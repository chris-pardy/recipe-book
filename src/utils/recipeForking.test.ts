import { describe, it, expect } from 'vitest'
import {
  isRecipeForked,
  getForkMetadata,
  createForkMetadata,
} from './recipeForking'
import type { ForkMetadata } from '../types/recipe'

describe('recipeForking', () => {
  describe('isRecipeForked', () => {
    it('should return true when recipe has fork metadata', () => {
      const recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        forkMetadata: {
          originalRecipeUri: 'at://did:plc:original/dev.chrispardy.recipes/rkey123',
          originalAuthorDid: 'did:plc:original',
          forkedAt: '2024-01-01T00:00:00Z',
        },
      }
      expect(isRecipeForked(recipe)).toBe(true)
    })

    it('should return false when recipe has no fork metadata', () => {
      const recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      expect(isRecipeForked(recipe)).toBe(false)
    })

    it('should return false when recipe is null', () => {
      expect(isRecipeForked(null)).toBe(false)
    })

    it('should return false when recipe is undefined', () => {
      expect(isRecipeForked(undefined)).toBe(false)
    })
  })

  describe('getForkMetadata', () => {
    it('should return fork metadata when recipe is forked', () => {
      const forkMetadata: ForkMetadata = {
        originalRecipeUri: 'at://did:plc:original/dev.chrispardy.recipes/rkey123',
        originalAuthorDid: 'did:plc:original',
        forkedAt: '2024-01-01T00:00:00Z',
      }
      const recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        forkMetadata,
      }
      expect(getForkMetadata(recipe)).toEqual(forkMetadata)
    })

    it('should return null when recipe has no fork metadata', () => {
      const recipe = {
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      expect(getForkMetadata(recipe)).toBeNull()
    })

    it('should return null when recipe is null', () => {
      expect(getForkMetadata(null)).toBeNull()
    })

    it('should return null when recipe is undefined', () => {
      expect(getForkMetadata(undefined)).toBeNull()
    })
  })

  describe('createForkMetadata', () => {
    it('should create fork metadata from valid recipe URI', () => {
      const originalRecipeUri = 'at://did:plc:original123/dev.chrispardy.recipes/rkey123'
      const forkMetadata = createForkMetadata(originalRecipeUri)

      expect(forkMetadata.originalRecipeUri).toBe(originalRecipeUri)
      expect(forkMetadata.originalAuthorDid).toBe('did:plc:original123')
      expect(forkMetadata.forkedAt).toBeDefined()
      expect(new Date(forkMetadata.forkedAt).getTime()).toBeGreaterThan(0)
    })

    it('should throw error for invalid recipe URI', () => {
      const invalidUri = 'invalid-uri'
      expect(() => createForkMetadata(invalidUri)).toThrow('Invalid recipe URI')
    })

    it('should throw error for URI without DID', () => {
      const invalidUri = 'at://not-a-did/dev.chrispardy.recipes/rkey123'
      expect(() => createForkMetadata(invalidUri)).toThrow('Invalid recipe URI')
    })
  })
})
