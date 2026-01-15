import { describe, it, expect } from 'vitest'
import {
  aggregateIngredients,
  formatAggregatedIngredient,
  aggregatedToRecipeIngredients,
  type AggregatedIngredient,
} from './ingredientAggregation'
import type { ExtractedIngredient } from './ingredientExtraction'

describe('ingredientAggregation', () => {
  describe('aggregateIngredients', () => {
    it('should combine same ingredients with same unit system', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 240, unit: 'g', byteStart: 0, byteEnd: 10 },
        { name: 'flour', amount: 100, unit: 'g', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('flour')
      expect(result[0].entries).toHaveLength(1)
      expect(result[0].entries[0].amount).toBe(340)
      expect(result[0].entries[0].unit).toBe('g')
      expect(result[0].entries[0].system).toBe('metric')
    })
    
    it('should NOT combine ingredients with different unit systems', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 240, unit: 'g', byteStart: 0, byteEnd: 10 },
        { name: 'flour', amount: 1, unit: 'oz', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('flour')
      expect(result[0].entries).toHaveLength(2)
      
      const metricEntry = result[0].entries.find(e => e.system === 'metric')
      const imperialEntry = result[0].entries.find(e => e.system === 'imperial')
      
      expect(metricEntry).toBeDefined()
      expect(metricEntry?.amount).toBe(240)
      expect(metricEntry?.unit).toBe('g')
      
      expect(imperialEntry).toBeDefined()
      expect(imperialEntry?.amount).toBe(1)
      expect(imperialEntry?.unit).toBe('oz')
    })
    
    it('should combine different metric units of same type', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 1, unit: 'kg', byteStart: 0, byteEnd: 10 },
        { name: 'flour', amount: 500, unit: 'g', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
      // 1kg + 500g = 1500g, normalized to g
      expect(result[0].entries[0].amount).toBe(1500)
      expect(result[0].entries[0].unit).toBe('g')
    })
    
    it('should combine different imperial units of same type', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'milk', amount: 2, unit: 'cup', byteStart: 0, byteEnd: 10 },
        { name: 'milk', amount: 8, unit: 'fl oz', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(1)
      // 2 cups = 16 fl oz, + 8 fl oz = 24 fl oz
      expect(result[0].entries[0].amount).toBe(24)
      expect(result[0].entries[0].unit).toBe('fl oz')
    })
    
    it('should keep different ingredients separate', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 240, unit: 'g', byteStart: 0, byteEnd: 10 },
        { name: 'sugar', amount: 100, unit: 'g', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('flour')
      expect(result[1].name).toBe('sugar')
    })
    
    it('should handle ingredients without amounts', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'salt', byteStart: 0, byteEnd: 10 },
        { name: 'pepper', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(2)
      expect(result[0].entries).toHaveLength(0)
      expect(result[1].entries).toHaveLength(0)
    })
    
    it('should handle ingredients with count units', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'garlic', amount: 2, unit: 'clove', byteStart: 0, byteEnd: 10 },
        { name: 'garlic', amount: 1, unit: 'clove', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      // Count units can't be converted, so they should be separate entries
      expect(result[0].entries.length).toBeGreaterThanOrEqual(1)
    })
    
    it('should handle complex example from issue', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 240, unit: 'g', byteStart: 0, byteEnd: 10 },
        { name: 'flour', amount: 1, unit: 'oz', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result).toHaveLength(1)
      expect(result[0].entries).toHaveLength(2)
      
      // Should have both metric and imperial entries
      const hasMetric = result[0].entries.some(e => e.system === 'metric' && e.unit === 'g')
      const hasImperial = result[0].entries.some(e => e.system === 'imperial' && e.unit === 'oz')
      
      expect(hasMetric).toBe(true)
      expect(hasImperial).toBe(true)
    })
    
    it('should track extractedFrom references', () => {
      const extracted: ExtractedIngredient[] = [
        { name: 'flour', amount: 240, unit: 'g', byteStart: 0, byteEnd: 10 },
        { name: 'flour', amount: 100, unit: 'g', byteStart: 0, byteEnd: 10 },
      ]
      
      const result = aggregateIngredients(extracted)
      
      expect(result[0].extractedFrom).toHaveLength(2)
      expect(result[0].extractedFrom[0]).toEqual(extracted[0])
      expect(result[0].extractedFrom[1]).toEqual(extracted[1])
    })
  })
  
  describe('formatAggregatedIngredient', () => {
    it('should format single metric entry', () => {
      const aggregated: AggregatedIngredient = {
        name: 'flour',
        entries: [{ amount: 340, unit: 'g', system: 'metric' }],
        extractedFrom: [],
      }
      
      const result = formatAggregatedIngredient(aggregated)
      expect(result).toBe('340g flour')
    })
    
    it('should format single imperial entry', () => {
      const aggregated: AggregatedIngredient = {
        name: 'flour',
        entries: [{ amount: 1, unit: 'oz', system: 'imperial' }],
        extractedFrom: [],
      }
      
      const result = formatAggregatedIngredient(aggregated)
      expect(result).toBe('1oz flour')
    })
    
    it('should format mixed metric and imperial entries', () => {
      const aggregated: AggregatedIngredient = {
        name: 'flour',
        entries: [
          { amount: 240, unit: 'g', system: 'metric' },
          { amount: 1, unit: 'oz', system: 'imperial' },
        ],
        extractedFrom: [],
      }
      
      const result = formatAggregatedIngredient(aggregated)
      // Should show both systems separated by " and "
      expect(result).toContain('240g')
      expect(result).toContain('1oz')
      expect(result).toContain(' and ')
      expect(result).toContain('flour')
    })
    
    it('should format multiple entries in same system', () => {
      const aggregated: AggregatedIngredient = {
        name: 'flour',
        entries: [
          { amount: 240, unit: 'g', system: 'metric' },
          { amount: 100, unit: 'g', system: 'metric' },
        ],
        extractedFrom: [],
      }
      
      const result = formatAggregatedIngredient(aggregated)
      // Should combine: 240g + 100g = 340g
      expect(result).toBe('340g flour')
    })
    
    it('should handle ingredients without entries', () => {
      const aggregated: AggregatedIngredient = {
        name: 'salt',
        entries: [],
        extractedFrom: [],
      }
      
      const result = formatAggregatedIngredient(aggregated)
      expect(result).toBe('salt')
    })
  })
  
  describe('aggregatedToRecipeIngredients', () => {
    it('should convert single metric entry', () => {
      const aggregated: AggregatedIngredient[] = [
        {
          name: 'flour',
          entries: [{ amount: 340, unit: 'g', system: 'metric' }],
          extractedFrom: [],
        },
      ]
      
      const result = aggregatedToRecipeIngredients(aggregated)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'flour',
        amount: 340,
        unit: 'g',
      })
    })
    
    it('should create separate entries for different unit systems', () => {
      const aggregated: AggregatedIngredient[] = [
        {
          name: 'flour',
          entries: [
            { amount: 240, unit: 'g', system: 'metric' },
            { amount: 1, unit: 'oz', system: 'imperial' },
          ],
          extractedFrom: [],
        },
      ]
      
      const result = aggregatedToRecipeIngredients(aggregated)
      
      // Should create two separate ingredient entries
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        name: 'flour',
        amount: 240,
        unit: 'g',
      })
      expect(result[1]).toEqual({
        name: 'flour',
        amount: 1,
        unit: 'oz',
      })
    })
    
    it('should combine entries within same system', () => {
      const aggregated: AggregatedIngredient[] = [
        {
          name: 'flour',
          entries: [
            { amount: 1, unit: 'kg', system: 'metric' },
            { amount: 500, unit: 'g', system: 'metric' },
          ],
          extractedFrom: [],
        },
      ]
      
      const result = aggregatedToRecipeIngredients(aggregated)
      
      // Should combine to 1500g
      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(1500)
      expect(result[0].unit).toBe('g')
    })
    
    it('should handle ingredients without entries', () => {
      const aggregated: AggregatedIngredient[] = [
        {
          name: 'salt',
          entries: [],
          extractedFrom: [],
        },
      ]
      
      const result = aggregatedToRecipeIngredients(aggregated)
      
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        name: 'salt',
      })
    })
  })
})
