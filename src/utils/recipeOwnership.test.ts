import { describe, it, expect } from 'vitest'
import { getDidFromUri, isRecipeOwned } from './recipeOwnership'

describe('recipeOwnership', () => {
  describe('getDidFromUri', () => {
    it('should extract DID from valid ATProto URI', () => {
      const uri = 'at://did:plc:abc123/dev.chrispardy.recipes/rkey123'
      expect(getDidFromUri(uri)).toBe('did:plc:abc123')
    })

    it('should handle URI without collection', () => {
      const uri = 'at://did:plc:abc123'
      expect(getDidFromUri(uri)).toBe('did:plc:abc123')
    })

    it('should return null for invalid URI', () => {
      expect(getDidFromUri('invalid')).toBeNull()
      expect(getDidFromUri('')).toBeNull()
    })

    it('should handle URI with multiple path segments', () => {
      const uri = 'at://did:plc:abc123/collection/rkey/subpath'
      expect(getDidFromUri(uri)).toBe('did:plc:abc123')
    })
  })

  describe('isRecipeOwned', () => {
    const userDid = 'did:plc:user123'
    const recipeUri = 'at://did:plc:user123/dev.chrispardy.recipes/rkey123'

    it('should return true when recipe is owned by user', () => {
      expect(isRecipeOwned(recipeUri, userDid)).toBe(true)
    })

    it('should return false when recipe is not owned by user', () => {
      const otherRecipeUri = 'at://did:plc:other123/dev.chrispardy.recipes/rkey123'
      expect(isRecipeOwned(otherRecipeUri, userDid)).toBe(false)
    })

    it('should return false when userDid is null', () => {
      expect(isRecipeOwned(recipeUri, null)).toBe(false)
    })

    it('should return false when userDid is empty string', () => {
      expect(isRecipeOwned(recipeUri, '')).toBe(false)
    })

    it('should return false when recipe URI is invalid', () => {
      expect(isRecipeOwned('invalid', userDid)).toBe(false)
    })
  })
})
