import { describe, it, expect, beforeEach } from 'vitest'
import { mockIndexedDB, setupIndexedDBMock } from './indexeddb'

describe('IndexedDB Mock', () => {
  beforeEach(() => {
    mockIndexedDB.reset()
  })

  it('should save and retrieve a recipe', async () => {
    const recipe = {
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Test Recipe',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
      ],
      steps: [
        { id: '1', text: 'Mix ingredients', order: 1 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await mockIndexedDB.saveRecipe(recipe)
    const retrieved = await mockIndexedDB.getRecipe(recipe.uri)
    
    expect(retrieved).toBeDefined()
    expect(retrieved?.title).toBe('Test Recipe')
  })

  it('should get all recipes', async () => {
    await mockIndexedDB.saveRecipe({
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Recipe 1',
      servings: 4,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    await mockIndexedDB.saveRecipe({
      uri: 'at://test/did/recipes/2',
      cid: 'test-cid-2',
      title: 'Recipe 2',
      servings: 2,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    const allRecipes = await mockIndexedDB.getAllRecipes()
    expect(allRecipes).toHaveLength(2)
  })

  it('should search recipes by title', async () => {
    await mockIndexedDB.saveRecipe({
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Chocolate Cake',
      servings: 4,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    await mockIndexedDB.saveRecipe({
      uri: 'at://test/did/recipes/2',
      cid: 'test-cid-2',
      title: 'Vanilla Cake',
      servings: 2,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    const results = await mockIndexedDB.searchRecipesByTitle('chocolate')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Chocolate Cake')
  })

  it('should search recipes by ingredient', async () => {
    await mockIndexedDB.saveRecipe({
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Chocolate Cake',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
        { id: '2', name: 'sugar', amount: 200, unit: 'g' },
      ],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    
    const results = await mockIndexedDB.searchRecipesByIngredient('flour')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Chocolate Cake')
  })

  it('should delete a recipe', async () => {
    const recipe = {
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await mockIndexedDB.saveRecipe(recipe)
    await mockIndexedDB.deleteRecipe(recipe.uri)
    
    const retrieved = await mockIndexedDB.getRecipe(recipe.uri)
    expect(retrieved).toBeNull()
  })

  it('should save and retrieve collections', async () => {
    const collection = {
      uri: 'at://test/did/collections/1',
      cid: 'test-cid-collection-1',
      name: 'My Recipes',
      description: 'Test collection',
      recipeUris: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await mockIndexedDB.saveCollection(collection)
    const retrieved = await mockIndexedDB.getCollection(collection.uri)
    
    expect(retrieved).toBeDefined()
    expect(retrieved?.name).toBe('My Recipes')
  })

  it('should get recipes by collection', async () => {
    const recipe1 = {
      uri: 'at://test/did/recipes/1',
      cid: 'test-cid-1',
      title: 'Recipe 1',
      servings: 4,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    const recipe2 = {
      uri: 'at://test/did/recipes/2',
      cid: 'test-cid-2',
      title: 'Recipe 2',
      servings: 2,
      ingredients: [],
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await mockIndexedDB.saveRecipe(recipe1)
    await mockIndexedDB.saveRecipe(recipe2)
    
    const collection = {
      uri: 'at://test/did/collections/1',
      cid: 'test-cid-collection-1',
      name: 'My Recipes',
      recipeUris: [recipe1.uri],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    await mockIndexedDB.saveCollection(collection)
    
    const recipes = await mockIndexedDB.getRecipesByCollection(collection.uri)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].uri).toBe(recipe1.uri)
  })

  it('should update sync state', async () => {
    await mockIndexedDB.updateSyncState({ lastSyncTimestamp: '2024-01-01T00:00:00Z' })
    
    const state = await mockIndexedDB.getSyncState()
    expect(state.lastSyncTimestamp).toBe('2024-01-01T00:00:00Z')
  })

  it('should setup IndexedDB mock globally', () => {
    const db = setupIndexedDBMock()
    expect(db).toBeDefined()
    expect(global.indexedDB).toBeDefined()
  })
})
