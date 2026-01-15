import { vi } from 'vitest'

/**
 * Mock implementation of IndexedDB for testing
 * This provides a mock IndexedDB API that can be used in tests
 */

export interface MockRecipe {
  uri: string
  cid: string
  title: string
  servings: number
  ingredients: Array<{
    id: string
    name: string
    amount?: number
    unit?: string
  }>
  steps: Array<{
    id: string
    text: string
    order: number
    metadata?: Record<string, unknown>
  }>
  subRecipes?: string[]
  createdAt: string
  updatedAt: string
  syncedAt?: string
}

export interface MockCollection {
  uri: string
  cid: string
  name: string
  description?: string
  recipeUris: string[]
  createdAt: string
  updatedAt: string
}

class MockIndexedDB {
  private recipes: Map<string, MockRecipe> = new Map()
  private collections: Map<string, MockCollection> = new Map()
  private syncState: { lastSyncTimestamp?: string } = {}

  /**
   * Mock opening IndexedDB database
   */
  async open(name: string, version?: number): Promise<IDBDatabase> {
    // Return a mock IDBDatabase object
    return {
      name,
      version: version || 1,
      objectStoreNames: {
        contains: vi.fn().mockReturnValue(true),
        length: 2,
        item: vi.fn(),
        [Symbol.iterator]: function* () {
          yield 'recipes'
          yield 'collections'
        },
      },
      close: vi.fn(),
      createObjectStore: vi.fn(),
      deleteObjectStore: vi.fn(),
      transaction: vi.fn(),
    } as unknown as IDBDatabase
  }

  /**
   * Mock saving a recipe to IndexedDB
   */
  async saveRecipe(recipe: MockRecipe): Promise<void> {
    this.recipes.set(recipe.uri, recipe)
  }

  /**
   * Mock getting a recipe from IndexedDB
   */
  async getRecipe(uri: string): Promise<MockRecipe | null> {
    return this.recipes.get(uri) || null
  }

  /**
   * Mock getting all recipes from IndexedDB
   */
  async getAllRecipes(): Promise<MockRecipe[]> {
    return Array.from(this.recipes.values())
  }

  /**
   * Mock searching recipes by title
   */
  async searchRecipesByTitle(query: string): Promise<MockRecipe[]> {
    const lowerQuery = query.toLowerCase()
    return Array.from(this.recipes.values()).filter(recipe =>
      recipe.title.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * Mock searching recipes by ingredient
   */
  async searchRecipesByIngredient(ingredientName: string): Promise<MockRecipe[]> {
    const lowerIngredient = ingredientName.toLowerCase()
    return Array.from(this.recipes.values()).filter(recipe =>
      recipe.ingredients.some(ing =>
        ing.name.toLowerCase().includes(lowerIngredient)
      )
    )
  }

  /**
   * Mock deleting a recipe from IndexedDB
   */
  async deleteRecipe(uri: string): Promise<void> {
    this.recipes.delete(uri)
  }

  /**
   * Mock saving a collection to IndexedDB
   */
  async saveCollection(collection: MockCollection): Promise<void> {
    this.collections.set(collection.uri, collection)
  }

  /**
   * Mock getting a collection from IndexedDB
   */
  async getCollection(uri: string): Promise<MockCollection | null> {
    return this.collections.get(uri) || null
  }

  /**
   * Mock getting all collections from IndexedDB
   */
  async getAllCollections(): Promise<MockCollection[]> {
    return Array.from(this.collections.values())
  }

  /**
   * Mock getting recipes by collection URI
   */
  async getRecipesByCollection(collectionUri: string): Promise<MockRecipe[]> {
    const collection = this.collections.get(collectionUri)
    if (!collection) {
      return []
    }
    
    return Array.from(this.recipes.values()).filter(recipe =>
      collection.recipeUris.includes(recipe.uri)
    )
  }

  /**
   * Mock updating sync state
   */
  async updateSyncState(state: { lastSyncTimestamp?: string }): Promise<void> {
    this.syncState = { ...this.syncState, ...state }
  }

  /**
   * Mock getting sync state
   */
  async getSyncState(): Promise<{ lastSyncTimestamp?: string }> {
    return { ...this.syncState }
  }

  /**
   * Reset all mock data
   */
  reset(): void {
    this.recipes.clear()
    this.collections.clear()
    this.syncState = {}
  }
}

// Create a singleton instance
export const mockIndexedDB = new MockIndexedDB()

/**
 * Setup function to mock IndexedDB globally
 */
export const setupIndexedDBMock = () => {
  const db = new MockIndexedDB()

  // Mock global indexedDB
  global.indexedDB = {
    open: vi.fn().mockImplementation((name: string, version?: number) => {
      return db.open(name, version)
    }),
    deleteDatabase: vi.fn(),
    databases: vi.fn().mockResolvedValue([]),
  } as unknown as IDBFactory

  return db
}
