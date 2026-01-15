import { describe, it, expect } from 'vitest'
import { highlightText, extractSearchTerms } from './searchHighlight'

describe('searchHighlight', () => {
  describe('highlightText', () => {
    it('should return unhighlighted text when no search terms provided', () => {
      const result = highlightText('Chocolate Cake', [])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        text: 'Chocolate Cake',
        highlighted: false,
      })
    })

    it('should highlight single matching term', () => {
      const result = highlightText('Chocolate Cake', ['chocolate'])
      expect(result.length).toBeGreaterThanOrEqual(2)
      const highlighted = result.find((s) => s.highlighted)
      expect(highlighted).toBeDefined()
      expect(highlighted?.text.toLowerCase()).toBe('chocolate')
      // Should have non-highlighted segments as well
      const nonHighlighted = result.filter((s) => !s.highlighted)
      expect(nonHighlighted.length).toBeGreaterThan(0)
    })

    it('should highlight multiple matching terms', () => {
      const result = highlightText('Chocolate Cake Recipe', ['chocolate', 'cake'])
      expect(result.length).toBeGreaterThan(1)
      const highlightedSegments = result.filter((s) => s.highlighted)
      expect(highlightedSegments.length).toBeGreaterThan(0)
    })

    it('should be case-insensitive', () => {
      const result = highlightText('Chocolate Cake', ['CHOCOLATE'])
      const highlighted = result.find((s) => s.highlighted)
      expect(highlighted).toBeDefined()
      expect(highlighted?.text.toLowerCase()).toBe('chocolate')
    })

    it('should handle partial matches', () => {
      const result = highlightText('Chocolate Cake', ['choco'])
      const highlighted = result.find((s) => s.highlighted)
      expect(highlighted).toBeDefined()
    })

    it('should handle empty text', () => {
      const result = highlightText('', ['chocolate'])
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('')
      expect(result[0].highlighted).toBe(false)
    })

    it('should handle text with no matches', () => {
      const result = highlightText('Apple Pie', ['chocolate'])
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe('Apple Pie')
      expect(result[0].highlighted).toBe(false)
    })

    it('should handle multiple occurrences of the same term', () => {
      const result = highlightText('chocolate chocolate cake', ['chocolate'])
      const highlighted = result.filter((s) => s.highlighted)
      expect(highlighted.length).toBeGreaterThan(1)
    })

    it('should escape special regex characters', () => {
      const result = highlightText('Test (with) [special] chars', ['(with)'])
      const highlighted = result.find((s) => s.highlighted)
      expect(highlighted).toBeDefined()
      expect(highlighted?.text).toBe('(with)')
    })

    it('should handle overlapping matches', () => {
      const result = highlightText('chocolate', ['choco', 'colate'])
      // Should handle both matches
      expect(result.length).toBeGreaterThan(1)
    })
  })

  describe('extractSearchTerms', () => {
    it('should split query by spaces', () => {
      const result = extractSearchTerms('chocolate cake recipe')
      expect(result).toEqual(['chocolate', 'cake', 'recipe'])
    })

    it('should convert to lowercase', () => {
      const result = extractSearchTerms('Chocolate Cake')
      expect(result).toEqual(['chocolate', 'cake'])
    })

    it('should filter out empty strings', () => {
      const result = extractSearchTerms('chocolate   cake')
      expect(result).toEqual(['chocolate', 'cake'])
    })

    it('should handle empty string', () => {
      const result = extractSearchTerms('')
      expect(result).toEqual([])
    })

    it('should handle whitespace-only string', () => {
      const result = extractSearchTerms('   ')
      expect(result).toEqual([])
    })

    it('should trim leading and trailing whitespace', () => {
      const result = extractSearchTerms('  chocolate cake  ')
      expect(result).toEqual(['chocolate', 'cake'])
    })

    it('should handle single word', () => {
      const result = extractSearchTerms('chocolate')
      expect(result).toEqual(['chocolate'])
    })
  })
})
