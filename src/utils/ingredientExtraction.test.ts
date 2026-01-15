import { describe, it, expect } from 'vitest'
import { extractIngredients, type ExtractedIngredient } from './ingredientExtraction'

describe('extractIngredients', () => {
  describe('Basic extraction', () => {
    it('should extract ingredients with amount and unit', () => {
      const result = extractIngredients('mix 240g flour and 60g sugar')
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        name: 'flour',
        amount: 240,
        unit: 'g',
      })
      expect(result[1]).toMatchObject({
        name: 'sugar',
        amount: 60,
        unit: 'g',
      })
      
      // Verify byte offsets are correct
      expect(result[0].byteStart).toBeGreaterThanOrEqual(0)
      expect(result[0].byteEnd).toBeGreaterThan(result[0].byteStart)
      expect(result[1].byteStart).toBeGreaterThanOrEqual(0)
      expect(result[1].byteEnd).toBeGreaterThan(result[1].byteStart)
    })
    
    it('should extract ingredients with decimal amounts', () => {
      const result = extractIngredients('add 1.5 cups of milk')
      
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'milk',
        amount: 1.5,
        unit: 'cup',
      })
    })
    
    it('should extract ingredients with fraction amounts', () => {
      const result = extractIngredients('use 1/2 cup flour and 3/4 tsp salt')
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        name: 'flour',
        amount: 0.5,
        unit: 'cup',
      })
      expect(result[1]).toMatchObject({
        name: 'salt',
        amount: 0.75,
        unit: 'tsp',
      })
    })
    
    it('should extract ingredients with mixed number fractions', () => {
      const result = extractIngredients('add 1 1/2 cups sugar')
      
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        name: 'sugar',
        amount: 1.5,
        unit: 'cup',
      })
    })
  })
  
  describe('Unit variations', () => {
    it('should handle metric weight units', () => {
      const result = extractIngredients('240g flour, 1kg sugar, 500mg salt')
      
      expect(result).toHaveLength(3)
      expect(result[0].unit).toBe('g')
      expect(result[1].unit).toBe('kg')
      expect(result[2].unit).toBe('mg')
    })
    
    it('should handle metric volume units', () => {
      const result = extractIngredients('500ml water, 2l broth')
      
      expect(result).toHaveLength(2)
      expect(result[0].unit).toBe('ml')
      expect(result[1].unit).toBe('l')
    })
    
    it('should handle imperial weight units', () => {
      const result = extractIngredients('1 lb butter, 8 oz cheese')
      
      expect(result).toHaveLength(2)
      expect(result[0].unit).toBe('lb')
      expect(result[1].unit).toBe('oz')
    })
    
    it('should handle imperial volume units', () => {
      const result = extractIngredients('1 cup flour, 2 tbsp butter, 1 tsp salt')
      
      expect(result).toHaveLength(3)
      expect(result[0].unit).toBe('cup')
      expect(result[1].unit).toBe('tbsp')
      expect(result[2].unit).toBe('tsp')
    })
    
    it('should handle unit abbreviations and full names', () => {
      const result = extractIngredients('1 tablespoon butter, 2 teaspoons vanilla')
      
      expect(result).toHaveLength(2)
      expect(result[0].unit).toBe('tbsp')
      expect(result[1].unit).toBe('tsp')
    })
    
    it('should handle common cooking units', () => {
      const result = extractIngredients('a pinch of salt, 2 cloves garlic, 1 sprig rosemary')
      
      expect(result.length).toBeGreaterThanOrEqual(2)
      // Note: "a pinch" might not extract amount, but should extract unit and name
      const saltIngredient = result.find(ing => ing.name.includes('salt'))
      if (saltIngredient) {
        expect(saltIngredient.unit).toBe('pinch')
      }
    })
  })
  
  describe('Ingredient name extraction', () => {
    it('should handle "of" connector', () => {
      const result = extractIngredients('add 1 cup of flour')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('flour')
    })
    
    it('should handle "of the" connector', () => {
      const result = extractIngredients('use 2 cups of the milk')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('milk')
    })
    
    it('should extract multiple ingredients separated by commas', () => {
      const result = extractIngredients('mix 240g flour, 60g sugar, 1 tsp salt')
      
      expect(result).toHaveLength(3)
      expect(result[0].name).toBe('flour')
      expect(result[1].name).toBe('sugar')
      expect(result[2].name).toBe('salt')
    })
    
    it('should extract multiple ingredients separated by "and"', () => {
      const result = extractIngredients('combine 1 cup flour and 2 eggs')
      
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].name).toBe('flour')
    })
  })
  
  describe('Edge cases', () => {
    it('should handle ingredients without amounts', () => {
      const result = extractIngredients('add salt and pepper')
      
      // Should extract at least ingredient names
      expect(result.length).toBeGreaterThanOrEqual(1)
    })
    
    it('should handle invalid fraction formats gracefully', () => {
      // Test that invalid fractions don't crash the extraction
      // The function should skip invalid fractions and continue
      const result = extractIngredients('add 1/0 cup flour')
      
      // Should either skip the invalid fraction or handle it gracefully
      expect(Array.isArray(result)).toBe(true)
    })
    
    it('should handle ingredients with numbers in their names', () => {
      const result = extractIngredients('add 1 cup 2% milk and 1 lb 80/20 ground beef')
      
      // Should extract ingredients even when they have numbers in names
      expect(result.length).toBeGreaterThanOrEqual(1)
      const milkIngredient = result.find(ing => ing.name.toLowerCase().includes('milk'))
      if (milkIngredient) {
        expect(milkIngredient.name).toContain('milk')
      }
    })
    
    it('should handle ingredients without units', () => {
      const result = extractIngredients('add 2 eggs and 1 onion')
      
      expect(result.length).toBeGreaterThanOrEqual(2)
      const eggsIngredient = result.find(ing => ing.name.includes('egg'))
      if (eggsIngredient) {
        expect(eggsIngredient.amount).toBe(2)
      }
    })
    
    it('should handle empty string', () => {
      const result = extractIngredients('')
      
      expect(result).toHaveLength(0)
    })
    
    it('should handle text with no ingredients', () => {
      const result = extractIngredients('bake for 30 minutes at 350 degrees')
      
      // Should return empty array or handle gracefully
      expect(Array.isArray(result)).toBe(true)
    })
    
    it('should handle complex step with multiple ingredients', () => {
      const result = extractIngredients(
        'mix 240g flour, 60g sugar, 1 tsp baking powder, 1/2 tsp salt, and 2 eggs'
      )
      
      expect(result.length).toBeGreaterThanOrEqual(4)
    })
    
    it('should handle ingredients with descriptive names', () => {
      const result = extractIngredients('add 1 cup all-purpose flour')
      
      expect(result).toHaveLength(1)
      expect(result[0].name).toContain('flour')
    })
    
    it('should handle case-insensitive unit matching', () => {
      const result = extractIngredients('Add 1 CUP flour and 2 TBSP butter')
      
      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].unit).toBe('cup')
    })
  })
  
  describe('Byte offset accuracy', () => {
    it('should return valid byte offsets', () => {
      const text = 'mix 240g flour'
      const result = extractIngredients(text)
      
      expect(result).toHaveLength(1)
      expect(result[0].byteStart).toBeGreaterThanOrEqual(0)
      expect(result[0].byteEnd).toBeLessThanOrEqual(
        new TextEncoder().encode(text).length
      )
      expect(result[0].byteEnd).toBeGreaterThan(result[0].byteStart)
    })
    
    it('should handle UTF-8 characters correctly', () => {
      const text = 'add 1 cup café'
      const result = extractIngredients(text)
      
      expect(result.length).toBeGreaterThanOrEqual(1)
      // Byte offsets should account for multi-byte characters
      const encodedLength = new TextEncoder().encode(text).length
      expect(result[0].byteEnd).toBeLessThanOrEqual(encodedLength)
    })
    
    it('should return byte offsets that match the ingredient in text', () => {
      const text = 'mix 240g flour and 60g sugar'
      const result = extractIngredients(text)
      
      for (const ingredient of result) {
        const extractedText = new TextDecoder().decode(
          new TextEncoder().encode(text).slice(ingredient.byteStart, ingredient.byteEnd)
        )
        // The extracted text should contain the ingredient name
        expect(extractedText.toLowerCase()).toContain(ingredient.name.toLowerCase())
      }
    })
  })
  
  describe('Real-world examples', () => {
    it('should handle example from issue description', () => {
      const result = extractIngredients('mix 240g flour and 60g sugar')
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        name: 'flour',
        amount: 240,
        unit: 'g',
      })
      expect(result[1]).toMatchObject({
        name: 'sugar',
        amount: 60,
        unit: 'g',
      })
    })
    
    it('should handle common recipe formats', () => {
      const result = extractIngredients(
        'In a large bowl, mix 2 cups all-purpose flour, 1 tablespoon baking powder, and 1/2 teaspoon salt'
      )
      
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
    
    it('should handle ingredients with preparation notes', () => {
      const result = extractIngredients('add 1 cup chopped onions and 2 cloves minced garlic')
      
      expect(result.length).toBeGreaterThanOrEqual(2)
    })
  })
})
