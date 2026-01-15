import { vi } from 'vitest'

/**
 * Mock implementation of ATProto API client
 * This provides a mock for @atproto/api that can be used in tests
 */

export interface MockAtprotoSession {
  did: string
  handle: string
  accessJwt: string
  refreshJwt: string
}

export interface MockRecipeRecord {
  uri: string
  cid: string
  value: {
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
  }
}

export interface MockCollectionRecord {
  uri: string
  cid: string
  value: {
    name: string
    description?: string
    recipeUris: string[]
    createdAt: string
    updatedAt: string
  }
}

class MockAtprotoClient {
  session: MockAtprotoSession | null = null
  private recipes: Map<string, MockRecipeRecord> = new Map()
  private collections: Map<string, MockCollectionRecord> = new Map()

  /**
   * Mock login - simulates OAuth flow
   */
  async login(identifier: string, password: string): Promise<MockAtprotoSession> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100))
    
    this.session = {
      did: `did:plc:${identifier}`,
      handle: identifier,
      accessJwt: 'mock-access-jwt',
      refreshJwt: 'mock-refresh-jwt',
    }
    
    return this.session
  }

  /**
   * Mock logout
   */
  async logout(): Promise<void> {
    this.session = null
  }

  /**
   * Mock creating a recipe record
   */
  async createRecipe(recipe: Omit<MockRecipeRecord['value'], 'createdAt' | 'updatedAt'>): Promise<MockRecipeRecord> {
    if (!this.session) {
      throw new Error('Not authenticated')
    }

    const now = new Date().toISOString()
    const uri = `at://${this.session.did}/dev.chrispardy.recipes/${Date.now()}`
    const cid = `mock-cid-${Date.now()}`

    const record: MockRecipeRecord = {
      uri,
      cid,
      value: {
        ...recipe,
        createdAt: now,
        updatedAt: now,
      },
    }

    this.recipes.set(uri, record)
    return record
  }

  /**
   * Mock getting a recipe record
   */
  async getRecipe(uri: string): Promise<MockRecipeRecord | null> {
    return this.recipes.get(uri) || null
  }

  /**
   * Mock listing recipes
   */
  async listRecipes(limit = 50): Promise<MockRecipeRecord[]> {
    return Array.from(this.recipes.values()).slice(0, limit)
  }

  /**
   * Mock updating a recipe record
   */
  async updateRecipe(uri: string, updates: Partial<MockRecipeRecord['value']>): Promise<MockRecipeRecord> {
    const existing = this.recipes.get(uri)
    if (!existing) {
      throw new Error('Recipe not found')
    }

    // Add a small delay to ensure updatedAt timestamp is different
    await new Promise(resolve => setTimeout(resolve, 1))

    const updated: MockRecipeRecord = {
      ...existing,
      value: {
        ...existing.value,
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    }

    this.recipes.set(uri, updated)
    return updated
  }

  /**
   * Mock deleting a recipe record
   */
  async deleteRecipe(uri: string): Promise<void> {
    if (!this.recipes.has(uri)) {
      throw new Error('Recipe not found')
    }
    this.recipes.delete(uri)
  }

  /**
   * Mock creating a collection record
   */
  async createCollection(collection: Omit<MockCollectionRecord['value'], 'createdAt' | 'updatedAt'>): Promise<MockCollectionRecord> {
    if (!this.session) {
      throw new Error('Not authenticated')
    }

    const now = new Date().toISOString()
    const uri = `at://${this.session.did}/dev.chrispardy.collections/${Date.now()}`
    const cid = `mock-cid-collection-${Date.now()}`

    const record: MockCollectionRecord = {
      uri,
      cid,
      value: {
        ...collection,
        createdAt: now,
        updatedAt: now,
      },
    }

    this.collections.set(uri, record)
    return record
  }

  /**
   * Mock getting a collection record
   */
  async getCollection(uri: string): Promise<MockCollectionRecord | null> {
    return this.collections.get(uri) || null
  }

  /**
   * Mock listing collections
   */
  async listCollections(limit = 50): Promise<MockCollectionRecord[]> {
    return Array.from(this.collections.values()).slice(0, limit)
  }

  /**
   * Reset all mock data
   */
  reset(): void {
    this.session = null
    this.recipes.clear()
    this.collections.clear()
  }
}

// Create a singleton instance
export const mockAtprotoClient = new MockAtprotoClient()

/**
 * Factory function to create a vi.mock compatible mock
 */
export const createAtprotoMock = () => {
  const client = new MockAtprotoClient()
  
  return {
    BskyAgent: vi.fn().mockImplementation(() => ({
      login: vi.fn().mockImplementation((identifier: string, password: string) => 
        client.login(identifier, password)
      ),
      session: null,
      getProfile: vi.fn(),
      createRecord: vi.fn(),
      getRecord: vi.fn(),
      listRecords: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
    })),
    client,
  }
}
