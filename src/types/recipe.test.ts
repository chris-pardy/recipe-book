import { describe, it, expect } from 'vitest'
import type {
  Recipe,
  RecipeRecord,
  Ingredient,
  Step,
  IngredientReference,
  CookTime,
} from './recipe'

describe('Recipe Types', () => {
  it('should define Ingredient interface correctly', () => {
    const ingredient: Ingredient = {
      id: '1',
      name: 'flour',
      amount: 240,
      unit: 'g',
    }

    expect(ingredient.id).toBe('1')
    expect(ingredient.name).toBe('flour')
    expect(ingredient.amount).toBe(240)
    expect(ingredient.unit).toBe('g')
  })

  it('should allow optional amount and unit in Ingredient', () => {
    const ingredient: Ingredient = {
      id: '2',
      name: 'salt',
    }

    expect(ingredient.amount).toBeUndefined()
    expect(ingredient.unit).toBeUndefined()
  })

  it('should define Step interface correctly', () => {
    const step: Step = {
      id: 'step-1',
      text: 'mix 240g flour and 60g sugar',
      order: 1,
    }

    expect(step.id).toBe('step-1')
    expect(step.text).toBe('mix 240g flour and 60g sugar')
    expect(step.order).toBe(1)
  })

  it('should allow optional metadata in Step', () => {
    const ingredientRef: IngredientReference = {
      ingredientId: '1',
      byteStart: 4,
      byteEnd: 10,
      amount: 240,
      unit: 'g',
    }

    const cookTime: CookTime = {
      duration: 30,
      byteStart: 20,
      byteEnd: 25,
    }

    const step: Step = {
      id: 'step-2',
      text: 'bake for 30 minutes',
      metadata: {
        ingredientReferences: [ingredientRef],
        cookTime,
      },
      order: 2,
    }

    expect(step.metadata?.ingredientReferences).toHaveLength(1)
    expect(step.metadata?.cookTime?.duration).toBe(30)
  })

  it('should define Recipe interface correctly', () => {
    const recipe: Recipe = {
      title: 'Test Recipe',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
        { id: '2', name: 'sugar', amount: 60, unit: 'g' },
      ],
      steps: [
        { id: 'step-1', text: 'mix ingredients', order: 1 },
        { id: 'step-2', text: 'bake', order: 2 },
      ],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(recipe.title).toBe('Test Recipe')
    expect(recipe.servings).toBe(4)
    expect(recipe.ingredients).toHaveLength(2)
    expect(recipe.steps).toHaveLength(2)
  })

  it('should allow optional subRecipes in Recipe', () => {
    const recipe: Recipe = {
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
      subRecipes: ['at://did:plc:123/dev.chrispardy.recipes/456'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(recipe.subRecipes).toHaveLength(1)
  })

  it('should define RecipeRecord with $type', () => {
    const record: RecipeRecord = {
      $type: 'dev.chrispardy.recipes',
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    expect(record.$type).toBe('dev.chrispardy.recipes')
  })
})
