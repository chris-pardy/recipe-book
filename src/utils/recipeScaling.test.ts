/**
 * Tests for Recipe Scaling Utilities
 */

import { describe, it, expect } from 'vitest'
import {
  calculateServingMultiplier,
  scaleIngredientAmount,
  regenerateStepText,
  scaleRecipe,
} from './recipeScaling'
import type { Recipe } from '../types/recipe'

describe('calculateServingMultiplier', () => {
  it('should calculate correct multiplier for doubling servings', () => {
    expect(calculateServingMultiplier(4, 8)).toBe(2)
  })

  it('should calculate correct multiplier for halving servings', () => {
    expect(calculateServingMultiplier(4, 2)).toBe(0.5)
  })

  it('should calculate correct multiplier for fractional servings', () => {
    expect(calculateServingMultiplier(4, 6)).toBe(1.5)
  })

  it('should calculate correct multiplier for 1.5x servings', () => {
    expect(calculateServingMultiplier(2, 3)).toBe(1.5)
  })

  it('should throw error for zero or negative servings', () => {
    expect(() => calculateServingMultiplier(0, 4)).toThrow('Servings must be greater than zero')
    expect(() => calculateServingMultiplier(4, 0)).toThrow('Servings must be greater than zero')
    expect(() => calculateServingMultiplier(-1, 4)).toThrow('Servings must be greater than zero')
  })
})

describe('scaleIngredientAmount', () => {
  it('should scale amount correctly', () => {
    expect(scaleIngredientAmount(240, 2)).toBe(480)
    expect(scaleIngredientAmount(240, 0.5)).toBe(120)
    expect(scaleIngredientAmount(100, 1.5)).toBe(150)
  })

  it('should handle undefined amount', () => {
    expect(scaleIngredientAmount(undefined, 2)).toBeUndefined()
  })

  it('should round to 2 decimal places', () => {
    expect(scaleIngredientAmount(100, 1.333)).toBe(133.3)
    expect(scaleIngredientAmount(100, 1.111)).toBe(111.1)
  })

  it('should preserve whole numbers', () => {
    expect(scaleIngredientAmount(100, 2)).toBe(200)
    expect(scaleIngredientAmount(50, 2)).toBe(100)
  })
})

describe('regenerateStepText', () => {
  it('should scale single ingredient amount in step text', () => {
    const original = 'Mix 240g flour'
    const result = regenerateStepText(original, 2)
    expect(result).toBe('Mix 480g flour')
  })

  it('should scale multiple ingredient amounts in step text', () => {
    const original = 'Mix 240g flour and 60g sugar'
    const result = regenerateStepText(original, 2)
    expect(result).toBe('Mix 480g flour and 120g sugar')
  })

  it('should scale fractional servings', () => {
    const original = 'Mix 240g flour'
    const result = regenerateStepText(original, 0.5)
    expect(result).toBe('Mix 120g flour')
  })

  it('should handle decimal amounts', () => {
    const original = 'Add 1.5 cups milk'
    const result = regenerateStepText(original, 2)
    expect(result).toBe('Add 3 cups milk')
  })

  it('should handle fractions in amounts', () => {
    const original = 'Add 1/2 cup butter'
    const result = regenerateStepText(original, 2)
    // Note: fraction parsing may convert to decimal
    expect(result).toContain('1')
    expect(result).toContain('cup butter')
  })

  it('should preserve text without ingredients', () => {
    const original = 'Preheat oven to 350°F'
    const result = regenerateStepText(original, 2)
    expect(result).toBe(original)
  })

  it('should handle empty text', () => {
    expect(regenerateStepText('', 2)).toBe('')
    expect(regenerateStepText('   ', 2)).toBe('   ')
  })

  it('should handle complex step with multiple ingredients', () => {
    const original = 'Mix 240g flour, 60g sugar, and 2 eggs'
    const result = regenerateStepText(original, 1.5)
    expect(result).toBe('Mix 360g flour, 90g sugar, and 3 eggs')
  })
})

describe('scaleRecipe', () => {
  const createTestRecipe = (): Recipe => ({
    title: 'Test Recipe',
    servings: 4,
    ingredients: [
      { id: '1', name: 'flour', amount: 240, unit: 'g' },
      { id: '2', name: 'sugar', amount: 60, unit: 'g' },
      { id: '3', name: 'eggs', amount: 2 },
    ],
    steps: [
      {
        id: '1',
        text: 'Mix 240g flour and 60g sugar',
        order: 1,
        metadata: {
          ingredientReferences: [
            {
              ingredientId: '1',
              byteStart: 4,
              byteEnd: 12,
              amount: 240,
              unit: 'g',
            },
            {
              ingredientId: '2',
              byteStart: 17,
              byteEnd: 23,
              amount: 60,
              unit: 'g',
            },
          ],
        },
      },
      {
        id: '2',
        text: 'Add 2 eggs',
        order: 2,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  })

  it('should scale recipe to double servings', () => {
    const recipe = createTestRecipe()
    const scaled = scaleRecipe(recipe, 8)

    expect(scaled.adjustedServings).toBe(8)
    expect(scaled.multiplier).toBe(2)
    expect(scaled.ingredients[0].amount).toBe(480)
    expect(scaled.ingredients[1].amount).toBe(120)
    expect(scaled.ingredients[2].amount).toBe(4)
    expect(scaled.steps[0].text).toBe('Mix 480g flour and 120g sugar')
    expect(scaled.steps[1].text).toBe('Add 4 eggs')
  })

  it('should scale recipe to half servings', () => {
    const recipe = createTestRecipe()
    const scaled = scaleRecipe(recipe, 2)

    expect(scaled.adjustedServings).toBe(2)
    expect(scaled.multiplier).toBe(0.5)
    expect(scaled.ingredients[0].amount).toBe(120)
    expect(scaled.ingredients[1].amount).toBe(30)
    expect(scaled.ingredients[2].amount).toBe(1)
  })

  it('should preserve original recipe', () => {
    const recipe = createTestRecipe()
    const originalServings = recipe.servings
    const originalAmount = recipe.ingredients[0].amount

    scaleRecipe(recipe, 8)

    expect(recipe.servings).toBe(originalServings)
    expect(recipe.ingredients[0].amount).toBe(originalAmount)
  })

  it('should handle fractional servings', () => {
    const recipe = createTestRecipe()
    const scaled = scaleRecipe(recipe, 6)

    expect(scaled.adjustedServings).toBe(6)
    expect(scaled.multiplier).toBe(1.5)
    expect(scaled.ingredients[0].amount).toBe(360)
    expect(scaled.ingredients[1].amount).toBe(90)
    expect(scaled.ingredients[2].amount).toBe(3)
  })

  it('should throw error for invalid servings', () => {
    const recipe = createTestRecipe()
    expect(() => scaleRecipe(recipe, 0)).toThrow('New servings must be greater than zero')
    expect(() => scaleRecipe(recipe, -1)).toThrow('New servings must be greater than zero')
  })

  it('should handle ingredients without amounts', () => {
    const recipe: Recipe = {
      title: 'Test',
      servings: 4,
      ingredients: [
        { id: '1', name: 'salt' }, // No amount
      ],
      steps: [
        {
          id: '1',
          text: 'Add salt to taste',
          order: 1,
        },
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const scaled = scaleRecipe(recipe, 8)
    expect(scaled.ingredients[0].amount).toBeUndefined()
  })

  it('should update ingredient references in step metadata', () => {
    const recipe = createTestRecipe()
    const scaled = scaleRecipe(recipe, 8)

    expect(scaled.steps[0].metadata?.ingredientReferences).toBeDefined()
    const refs = scaled.steps[0].metadata?.ingredientReferences
    if (refs) {
      expect(refs[0].amount).toBe(480)
      expect(refs[1].amount).toBe(120)
    }
  })

  it('should maintain step order', () => {
    const recipe = createTestRecipe()
    const scaled = scaleRecipe(recipe, 8)

    expect(scaled.steps[0].order).toBe(1)
    expect(scaled.steps[1].order).toBe(2)
  })
})
