import { describe, it, expect, beforeEach } from 'vitest'
import { mockAtprotoClient, createAtprotoMock } from './atproto'

describe('ATProto Mock', () => {
  beforeEach(() => {
    mockAtprotoClient.reset()
  })

  it('should login and create a session', async () => {
    const session = await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    expect(session).toBeDefined()
    expect(session.handle).toBe('testuser.bsky.social')
    expect(session.did).toContain('did:plc:')
    expect(mockAtprotoClient.session).toEqual(session)
  })

  it('should create a recipe record', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    const recipe = await mockAtprotoClient.createRecipe({
      title: 'Test Recipe',
      servings: 4,
      ingredients: [
        { id: '1', name: 'flour', amount: 240, unit: 'g' },
      ],
      steps: [
        { id: '1', text: 'Mix ingredients', order: 1 },
      ],
    })
    
    expect(recipe).toBeDefined()
    expect(recipe.value.title).toBe('Test Recipe')
    expect(recipe.value.servings).toBe(4)
    expect(recipe.uri).toContain('dev.chrispardy.recipes')
  })

  it('should get a recipe record', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    const created = await mockAtprotoClient.createRecipe({
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
    })
    
    const retrieved = await mockAtprotoClient.getRecipe(created.uri)
    
    expect(retrieved).toBeDefined()
    expect(retrieved?.value.title).toBe('Test Recipe')
  })

  it('should update a recipe record', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    const created = await mockAtprotoClient.createRecipe({
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
    })
    
    const updated = await mockAtprotoClient.updateRecipe(created.uri, {
      title: 'Updated Recipe',
    })
    
    expect(updated.value.title).toBe('Updated Recipe')
    expect(updated.value.updatedAt).not.toBe(created.value.updatedAt)
  })

  it('should delete a recipe record', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    const created = await mockAtprotoClient.createRecipe({
      title: 'Test Recipe',
      servings: 4,
      ingredients: [],
      steps: [],
    })
    
    await mockAtprotoClient.deleteRecipe(created.uri)
    
    const retrieved = await mockAtprotoClient.getRecipe(created.uri)
    expect(retrieved).toBeNull()
  })

  it('should create a collection record', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    
    const collection = await mockAtprotoClient.createCollection({
      name: 'My Recipes',
      description: 'Test collection',
      recipeUris: [],
    })
    
    expect(collection).toBeDefined()
    expect(collection.value.name).toBe('My Recipes')
    expect(collection.uri).toContain('dev.chrispardy.collections')
  })

  it('should require authentication for creating records', async () => {
    await expect(
      mockAtprotoClient.createRecipe({
        title: 'Test Recipe',
        servings: 4,
        ingredients: [],
        steps: [],
      })
    ).rejects.toThrow('Not authenticated')
  })

  it('should logout and clear session', async () => {
    await mockAtprotoClient.login('testuser.bsky.social', 'password')
    expect(mockAtprotoClient.session).toBeDefined()
    
    await mockAtprotoClient.logout()
    expect(mockAtprotoClient.session).toBeNull()
  })
})

describe('ATProto Mock Factory', () => {
  it('should create a mock factory', () => {
    const mock = createAtprotoMock()
    expect(mock.BskyAgent).toBeDefined()
    expect(mock.client).toBeDefined()
  })
})
