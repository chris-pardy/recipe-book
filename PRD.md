# Recipe Book - Product Requirements Document

## Overview
A Single Page Application (SPA) for storing and managing recipes using Bluesky's AT Protocol. Recipes are stored in the user's Personal Data Server (PDS) via a custom collection, with local caching in IndexedDB for offline access and fast search.

## Technical Architecture

### Stack
- **Frontend**: React + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui components
- **Testing**: Vitest + React Testing Library (full unit test coverage)
- **Authentication**: Bluesky OAuth Flow via @atproto/api
- **Storage**: 
  - Primary: ATProto custom collections in user's PDS
    - Recipes: `dev.chrispardy.recipes` lexicon
    - Collections: `dev.chrispardy.collections` lexicon (new)
  - Cache: IndexedDB (browser)
- **Sync**: ATProto Firehose for background synchronization
- **Communication**: Browser directly interacts with PDS (no backend server)

### Data Model

#### Recipe Record Schema
```typescript
{
  title: string (required)
  servings: number (required)
  ingredients: Ingredient[] (required)
  steps: Step[] (required)
  subRecipes?: string[] // Array of recipe record URIs
  createdAt: string (ISO timestamp)
  updatedAt: string (ISO timestamp)
}

Ingredient {
  id: string
  name: string
  amount?: number
  unit?: string
  // When aggregating: same ingredients across steps are combined
  // Unit conversion: "240g flour" + "1 oz flour" = "268.35g flour"
}

Step {
  id: string
  text: string // Natural language: "mix 240g flour, 60g sugar"
  metadata?: {
    ingredientReferences?: {
      ingredientId: string // References aggregated ingredient ID
      byteStart: number
      byteEnd: number
      amount?: number // Amount used in this step (for scaling)
      unit?: string // Unit used in this step
    }[]
    cookTime?: {
      duration: number // in minutes
      byteStart: number
      byteEnd: number
    }
  }
  order: number
}
```

#### Collections
- User-defined collections for organizing recipes
- Stored in PDS using custom lexicon: `dev.chrispardy.collections`
- Default collection: "my-saved recipes" (auto-created on first recipe save)
- Recipes can belong to multiple collections
- Collections can contain:
  - Owned recipes (editable)
  - Forked recipes (read-only, reference to original)

#### Collection Record Schema
```typescript
{
  name: string (required)
  description?: string
  recipeUris: string[] // Array of recipe record URIs
  createdAt: string (ISO timestamp)
  updatedAt: string (ISO timestamp)
}
```

## Core Features

### Phase 1: MVP
1. **Authentication**
   - Bluesky OAuth login flow
   - Session management
   - Logout functionality

2. **Create Recipe** (Basic)
   - Form with: title, servings, steps (natural language input)
   - User types steps in natural language (e.g., "mix 240g flour and 60g sugar")
   - System automatically extracts ingredients from step text
   - Ingredients list auto-generated and aggregated (same ingredients combined with unit conversion)
   - Save to PDS custom collection
   - Basic ingredient extraction (amounts, units, ingredient names)

3. **View Recipe**
   - Display recipe details
   - Read-only view for non-owned recipes
   - All recipes are public (accessible via URL)
   - Recipe discovery: users need specific recipe URL to view

### Phase 2: Core Functionality
4. **Edit Recipe**
   - Edit owned recipes
   - Update and save changes to PDS

5. **Delete Recipe**
   - Remove owned recipes from PDS

6. **Collections Management**
   - Create custom collections
   - Add recipes to collections
   - View recipes by collection
   - Auto-create "my-saved recipes" collection

### Phase 3: Advanced Features
7. **Advanced Metadata Extraction**
   - Enhanced ingredient parsing (handle variations, synonyms)
   - Extract cook time from step text
   - Store metadata with byte offsets for ingredient references
   - Handle percentage-based ingredient usage in steps

8. **Recipe Forking**
   - Add someone else's recipe to your collection
   - Creates read-only copy in user's collection

9. **Sub-recipes**
   - Link to other recipes as sub-recipes
   - Support infinite nesting
   - Display sub-recipes in recipe view

10. **Serving Size Adjustment & Ingredient Aggregation**
    - Adjust servings and regenerate step text with updated amounts
    - Aggregate ingredients across steps (combine same ingredients)
    - Unit conversion (g ↔ oz, cups ↔ ml, etc.)
    - Normalize to common unit when displaying aggregated ingredients
    - Example: "240g flour" + "1 oz flour" = "268.35g flour" in ingredients list

11. **Search**
    - Search recipes in IndexedDB cache
    - Filter by title, ingredients, collections

12. **IndexedDB Caching**
    - Cache recipes locally for offline access
    - Sync via Firehose when app is active
    - Search operates on cached data

## User Flows

### Authentication Flow
1. User clicks "Login with Bluesky"
2. Redirected to Bluesky OAuth
3. User authorizes application
4. Redirected back with auth token
5. Store session in browser storage
6. Initialize IndexedDB cache

### Create Recipe Flow
1. User clicks "New Recipe"
2. Fill form: title, servings, steps (typed in natural language)
3. As user types steps, system extracts ingredients automatically
4. System aggregates ingredients across steps (combines same ingredients with unit conversion)
5. Display auto-generated ingredients list (read-only, aggregated and normalized)
6. Click "Save"
7. Create record in PDS custom collection with extracted ingredient data
8. Add to IndexedDB cache
9. Optionally add to collection (default: "my-saved recipes")

### View Recipe Flow
1. User navigates to recipe (from list or direct link/URL)
2. Recipe is public (accessible to anyone with URL)
3. If owned: show edit/delete options
4. If not owned: show "Add to My Recipes" option
5. Display recipe details, ingredients, steps
6. If sub-recipes exist, display links to them

### Home Page Flow
1. User lands on home page
2. If collections exist: display list of collections
3. If no collections: display list of all user's recipes
4. User can navigate to collections or individual recipes

### Sync Flow
1. App connects to ATProto Firehose
2. Listen for changes to recipe collection
3. Update IndexedDB cache when changes detected
4. Refresh UI if viewing affected recipe

## Technical Requirements

### ATProto Integration
- Custom lexicons:
  - Recipes: `dev.chrispardy.recipes` (record type: Recipe)
  - Collections: `dev.chrispardy.collections` (record type: Collection)
- Use @atproto/api for all PDS interactions
- Handle rate limiting and errors gracefully
- All recipes are public (accessible via URL)
- Recipe discovery: users need specific recipe URL

### IndexedDB Schema
- Store recipes with full data
- Index by: title, ingredients, collections, createdAt
- Store sync state (last sync timestamp)

### Unit Conversion & Ingredient Aggregation
- Prefer metric units (g, kg, ml, etc.) but allow imperial (cups, oz, etc.)
- Aggregate ingredients: combine same ingredients across steps
- **Important**: Don't mix metric and imperial when aggregating
  - If same ingredient appears with different unit systems, display separately
  - Example: "240g flour" + "1 oz flour" → display as "240g and 1oz flour" (not combined)
- Only combine ingredients with same unit system
- Preserve original step text while maintaining aggregated ingredient list
- Users can manually add ingredients if extraction fails (with suggestion matching)

### Testing
- Full unit test coverage using Vitest
- Component testing with React Testing Library
- Mock ATProto API calls for testing
- Mock IndexedDB for testing
- Test utilities and helpers

### Performance
- Lazy load recipes from IndexedDB
- Background sync via Firehose
- Optimistic UI updates
- Handle offline scenarios

### Offline Support
- If PDS is offline, allow local edits
- Mark edits as "pending sync" in IndexedDB
- Sync pending changes when connection is restored
- Show sync status indicators in UI

### Step Management
- Steps cannot be reordered after creation
- Steps can be edited (modify text, which triggers ingredient re-extraction)
- Steps maintain order field (set at creation time)

### Security & Privacy
- All data stored in user's own PDS
- No backend server (no data passes through third party)
- OAuth tokens stored securely in browser
- Respect Bluesky privacy settings

## Success Metrics
- User can successfully authenticate
- User can create and view recipes
- Recipes persist in PDS
- Local cache provides fast search
- Background sync keeps data current

## Future Considerations
- Recipe images (blob storage in PDS)
- Recipe sharing via Bluesky posts
- Meal planning features
- Shopping list generation
- Recipe import/export
- Collaborative editing (if ATProto supports it)
- Recipe versioning/history (not in MVP)
