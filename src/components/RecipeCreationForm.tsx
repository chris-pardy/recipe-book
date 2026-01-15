/**
 * Recipe Creation Form Component
 * 
 * Allows users to create recipes with natural language input,
 * automatic ingredient extraction, and manual ingredient addition.
 */

import { useState, useCallback, useMemo, useRef, useEffect, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { extractIngredients, type ExtractedIngredient } from '../utils/ingredientExtraction'
import { aggregateIngredients as aggregateIngredientsUtil, aggregatedToRecipeIngredients } from '../utils/ingredientAggregation'
import { getUnitSystem } from '../utils/unitConversion'
import { wouldCreateCircularReference } from '../utils/subRecipeValidation'
import { createRecipe, updateRecipe } from '../services/atproto'
import { getAuthenticatedAgent } from '../services/agent'
import { recipeDB } from '../services/indexeddb'
import { collectionDB } from '../services/indexeddb'
import { addRecipeToCollection, ensureRecipeInDefaultCollection } from '../services/collections'
import { cn } from '../lib/utils'
import type { Recipe, Ingredient, Step } from '../types/recipe'
import type { Collection } from '../types/collection'

export interface RecipeCreationFormProps {
  /** Callback when recipe is successfully created */
  onSuccess?: (uri: string) => void
  /** Callback when form is cancelled */
  onCancel?: () => void
  className?: string
  /** Recipe URI when editing an existing recipe */
  recipeUri?: string
  /** Initial recipe data for edit mode */
  initialRecipe?: Recipe
}

interface FormStep {
  id: string
  text: string
}

interface AggregatedIngredient {
  id: string
  name: string
  amount?: number
  unit?: string
  extractedFrom: ExtractedIngredient[]
}

/**
 * Fuzzy match score constants
 */
const FUZZY_MATCH_SCORES = {
  EXACT: 1.0,
  TARGET_CONTAINS_QUERY: 0.8,
  QUERY_CONTAINS_TARGET: 0.6,
  MIN_THRESHOLD: 0.3,
} as const

/**
 * Simple fuzzy matching function for ingredient suggestions
 * Returns a score between 0 and 1, where 1 is an exact match
 * 
 * @param query - The search query string
 * @param target - The target string to match against
 * @returns A score between 0 and 1, where 1 is an exact match
 */
function fuzzyMatch(query: string, target: string): number {
  const queryLower = query.toLowerCase().trim()
  const targetLower = target.toLowerCase().trim()
  
  if (queryLower === targetLower) return FUZZY_MATCH_SCORES.EXACT
  if (targetLower.includes(queryLower)) return FUZZY_MATCH_SCORES.TARGET_CONTAINS_QUERY
  if (queryLower.includes(targetLower)) return FUZZY_MATCH_SCORES.QUERY_CONTAINS_TARGET
  
  // Simple Levenshtein-like scoring
  let matches = 0
  for (let i = 0; i < Math.min(queryLower.length, targetLower.length); i++) {
    if (queryLower[i] === targetLower[i]) matches++
  }
  
  return matches / Math.max(queryLower.length, targetLower.length)
}

/**
 * Helper function to safely generate UUIDs with fallback
 * @returns A unique identifier string
 */
function generateUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
  } catch {
    // Fallback for environments where crypto.randomUUID is not available
  }
  // Fallback UUID generation
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Aggregate ingredients from all steps, combining duplicates with unit conversion
 * 
 * This function processes recipe steps and manual ingredients, extracting
 * ingredient information and combining duplicates based on name matching.
 * Uses unit conversion utilities to combine ingredients within the same unit system,
 * but keeps metric and imperial units separate.
 * 
 * @param steps - Array of recipe step objects with text
 * @param manualIngredients - Array of manually added ingredients
 * @returns Array of aggregated ingredients with combined amounts where applicable
 */
function aggregateIngredients(
  steps: FormStep[],
  manualIngredients: AggregatedIngredient[]
): AggregatedIngredient[] {
  // Extract all ingredients from steps
  const allExtracted: ExtractedIngredient[] = []
  
  for (const step of steps) {
    if (!step.text.trim()) continue
    const extracted = extractIngredients(step.text)
    allExtracted.push(...extracted)
  }
  
  // Use the new aggregation utility
  const aggregated = aggregateIngredientsUtil(allExtracted)
  
  // Convert to form's AggregatedIngredient format
  // This handles multiple unit systems by creating separate entries
  const formIngredients: AggregatedIngredient[] = []
  
  for (const agg of aggregated) {
    // Convert aggregated entries to recipe ingredients format
    // This will create separate entries for different unit systems
    const recipeIngredients = aggregatedToRecipeIngredients([agg])
    
    // Create form ingredients from recipe ingredients
    for (const recipeIng of recipeIngredients) {
      // Use all extracted ingredients for this name (they're already aggregated)
      formIngredients.push({
        id: generateUUID(),
        name: recipeIng.name,
        amount: recipeIng.amount,
        unit: recipeIng.unit,
        extractedFrom: agg.extractedFrom,
      })
    }
  }
  
  // Merge with manual ingredients
  const manualMap = new Map<string, AggregatedIngredient[]>()
  for (const manual of manualIngredients) {
    const key = manual.name.toLowerCase()
    if (!manualMap.has(key)) {
      manualMap.set(key, [])
    }
    manualMap.get(key)!.push(manual)
  }
  
  // Merge manual ingredients with extracted ones
  const result: AggregatedIngredient[] = []
  
  // Add form ingredients (from extraction)
  for (const formIng of formIngredients) {
    const key = formIng.name.toLowerCase()
    
    const manualList = manualMap.get(key)
    if (manualList && manualList.length > 0) {
      // Try to merge with manual ingredients
      let merged = false
      for (const manual of manualList) {
        // If same unit, combine amounts
        if (manual.unit === formIng.unit && manual.amount !== undefined && formIng.amount !== undefined) {
          result.push({
            id: manual.id,
            name: manual.name,
            amount: (manual.amount || 0) + formIng.amount,
            unit: formIng.unit,
            extractedFrom: [...manual.extractedFrom, ...formIng.extractedFrom],
          })
          merged = true
          break
        }
      }
      
      if (!merged) {
        // Different units - keep both
        result.push(formIng)
        result.push(...manualList)
      }
      
      manualMap.delete(key)
    } else {
      result.push(formIng)
    }
  }
  
  // Add remaining manual ingredients that weren't merged
  for (const manualList of manualMap.values()) {
    result.push(...manualList)
  }
  
  return result
}

/**
 * Get ingredient suggestions based on existing ingredients
 * 
 * Uses fuzzy matching to find ingredients that match the query string.
 * Returns up to the specified limit of suggestions, sorted by relevance score.
 * 
 * @param query - The search query string
 * @param existingIngredients - Array of existing ingredients to search through
 * @param limit - Maximum number of suggestions to return (default: 5)
 * @returns Array of matching ingredients sorted by relevance
 */
function getIngredientSuggestions(
  query: string,
  existingIngredients: AggregatedIngredient[],
  limit = 5
): AggregatedIngredient[] {
  if (!query.trim()) return []
  
  const scored = existingIngredients
    .map(ing => ({
      ingredient: ing,
      score: fuzzyMatch(query, ing.name),
    }))
    .filter(item => item.score > FUZZY_MATCH_SCORES.MIN_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.ingredient)
  
  return scored
}

export function RecipeCreationForm({
  onSuccess,
  onCancel,
  className,
  recipeUri,
  initialRecipe,
}: RecipeCreationFormProps) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const isEditMode = !!recipeUri && !!initialRecipe
  
  // Initialize form state from initialRecipe if in edit mode
  const [title, setTitle] = useState(initialRecipe?.title || '')
  const [servings, setServings] = useState<number>(initialRecipe?.servings || 1)
  const [steps, setSteps] = useState<FormStep[]>(() => {
    if (initialRecipe?.steps && initialRecipe.steps.length > 0) {
      return initialRecipe.steps.map(step => ({
        id: step.id,
        text: step.text,
      }))
    }
    return [{ id: generateUUID(), text: '' }]
  })
  const [manualIngredients, setManualIngredients] = useState<AggregatedIngredient[]>(() => {
    if (initialRecipe?.ingredients) {
      // Convert recipe ingredients to aggregated ingredients
      // Only include ingredients that weren't extracted from steps
      return initialRecipe.ingredients
        .filter(ing => {
          // Check if this ingredient appears in any step
          const stepTexts = initialRecipe.steps.map(s => s.text).join(' ')
          const extracted = extractIngredients(stepTexts)
          return !extracted.some(ext => ext.name.toLowerCase() === ing.name.toLowerCase())
        })
        .map(ing => ({
          id: ing.id,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          extractedFrom: [],
        }))
    }
    return []
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const successTimeoutRef = useRef<number | null>(null)
  const extractionTimeoutRef = useRef<number | null>(null)
  const [collections, setCollections] = useState<(Collection & { uri: string })[]>([])
  const [selectedCollectionUris, setSelectedCollectionUris] = useState<string[]>([])
  
  // Manual ingredient addition state
  const [showManualIngredient, setShowManualIngredient] = useState(false)
  const [manualIngredientName, setManualIngredientName] = useState('')
  const [manualIngredientAmount, setManualIngredientAmount] = useState('')
  const [manualIngredientUnit, setManualIngredientUnit] = useState('')
  const [ingredientSuggestions, setIngredientSuggestions] = useState<AggregatedIngredient[]>([])
  
  // Sub-recipe selection state
  const [subRecipes, setSubRecipes] = useState<string[]>(() => {
    return initialRecipe?.subRecipes || []
  })
  const [showSubRecipeSelector, setShowSubRecipeSelector] = useState(false)
  const [subRecipeSearchQuery, setSubRecipeSearchQuery] = useState('')
  const [subRecipeSearchResults, setSubRecipeSearchResults] = useState<(Recipe & { uri: string })[]>([])
  const [isSearchingSubRecipes, setIsSearchingSubRecipes] = useState(false)
  const [subRecipeError, setSubRecipeError] = useState<string | null>(null)
  
  // Debounce steps for ingredient extraction to prevent race conditions
  const deferredSteps = useDeferredValue(steps)
  
  // Aggregate all ingredients (from steps + manual)
  const aggregatedIngredients = useMemo(() => {
    return aggregateIngredients(deferredSteps, manualIngredients)
  }, [deferredSteps, manualIngredients])
  
  // Memoize manual ingredient IDs for O(1) lookup
  const manualIngredientIds = useMemo(
    () => new Set(manualIngredients.map(m => m.id)),
    [manualIngredients]
  )
  
  // Update suggestions when manual ingredient name changes (debounced)
  const updateSuggestions = useCallback((name: string) => {
    // Clear any pending timeout
    if (extractionTimeoutRef.current !== null) {
      window.clearTimeout(extractionTimeoutRef.current)
    }
    
    // Debounce suggestion updates
    extractionTimeoutRef.current = window.setTimeout(() => {
      const suggestions = getIngredientSuggestions(name, aggregatedIngredients)
      setIngredientSuggestions(suggestions)
      extractionTimeoutRef.current = null
    }, 300)
  }, [aggregatedIngredients])
  
  // Load collections on mount
  useEffect(() => {
    async function loadCollections() {
      if (!isAuthenticated) return
      try {
        const allCollections = await collectionDB.getAll()
        setCollections(allCollections)
      } catch (err) {
        // Silently fail - collections are optional
        console.error('Failed to load collections:', err)
      }
    }
    loadCollections()
  }, [isAuthenticated])

  // Search for recipes to add as sub-recipes
  const searchSubRecipes = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSubRecipeSearchResults([])
      return
    }

    setIsSearchingSubRecipes(true)
    setSubRecipeError(null)

    try {
      // Note: Loading all recipes with getAll() could be slow with many recipes.
      // Consider implementing pagination, a more efficient search index, or limiting
      // initial results and loading more on scroll for better performance.
      const allRecipes = await recipeDB.getAll()
      const queryLower = query.toLowerCase().trim()
      
      // Filter recipes that match the query and exclude:
      // - The current recipe (if editing)
      // - Already selected sub-recipes
      const matchingRecipes = allRecipes.filter((recipe) => {
        if (recipeUri && recipe.uri === recipeUri) return false
        if (subRecipes.includes(recipe.uri)) return false
        return recipe.title.toLowerCase().includes(queryLower)
      })

      setSubRecipeSearchResults(matchingRecipes.slice(0, 10)) // Limit to 10 results
    } catch (err) {
      // Provide more specific error messages for different failure types
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setSubRecipeError('Storage quota exceeded. Please free up some space.')
      } else if (err instanceof DOMException && err.name === 'InvalidStateError') {
        setSubRecipeError('Database connection error. Please refresh the page.')
      } else if (err instanceof Error) {
        setSubRecipeError(`Failed to search recipes: ${err.message}`)
      } else {
        setSubRecipeError('Failed to search recipes. Please try again.')
      }
    } finally {
      setIsSearchingSubRecipes(false)
    }
  }, [recipeUri, subRecipes])

  // Debounced sub-recipe search
  useEffect(() => {
    if (!showSubRecipeSelector) return

    const timeoutId = window.setTimeout(() => {
      searchSubRecipes(subRecipeSearchQuery)
    }, 300)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [subRecipeSearchQuery, showSubRecipeSelector, searchSubRecipes])

  // Load sub-recipe previews
  const [subRecipePreviews, setSubRecipePreviews] = useState<Map<string, Recipe & { uri: string }>>(new Map())
  
  useEffect(() => {
    async function loadSubRecipePreviews() {
      if (subRecipes.length === 0) {
        setSubRecipePreviews(new Map())
        return
      }

      const previews = new Map<string, Recipe & { uri: string }>()
      for (const uri of subRecipes) {
        try {
          const recipe = await recipeDB.get(uri)
          if (recipe) {
            previews.set(uri, recipe)
          }
        } catch (err) {
          console.error(`Failed to load sub-recipe ${uri}:`, err)
        }
      }
      setSubRecipePreviews(previews)
    }

    loadSubRecipePreviews()
  }, [subRecipes])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current !== null) {
        window.clearTimeout(successTimeoutRef.current)
      }
      if (extractionTimeoutRef.current !== null) {
        window.clearTimeout(extractionTimeoutRef.current)
      }
    }
  }, [])
  
  // Clear error when user starts typing
  const clearError = useCallback(() => {
    setError(null)
  }, [])
  
  const handleStepChange = (id: string, text: string) => {
    setSteps(prev => prev.map(step => step.id === id ? { ...step, text } : step))
    clearError()
  }
  
  const handleAddStep = () => {
    setSteps(prev => [...prev, { id: generateUUID(), text: '' }])
  }
  
  const handleRemoveStep = (id: string) => {
    setSteps(prev => {
      const filtered = prev.filter(step => step.id !== id)
      return filtered.length === 0 ? [{ id: generateUUID(), text: '' }] : filtered
    })
  }
  
  const handleManualIngredientNameChange = (value: string) => {
    setManualIngredientName(value)
    updateSuggestions(value)
    clearError()
  }
  
  const handleTitleChange = (value: string) => {
    setTitle(value)
    clearError()
  }
  
  const handleServingsChange = (value: string) => {
    const parsed = value === '' ? 1 : parseInt(value, 10)
    setServings(isNaN(parsed) ? 1 : parsed || 1)
    clearError()
  }
  
  const handleSelectSuggestion = (suggestion: AggregatedIngredient) => {
    setManualIngredientName(suggestion.name)
    if (suggestion.amount) {
      setManualIngredientAmount(suggestion.amount.toString())
    }
    if (suggestion.unit) {
      setManualIngredientUnit(suggestion.unit)
    }
    setIngredientSuggestions([])
  }
  
  const handleAddManualIngredient = () => {
    const name = manualIngredientName.trim()
    if (!name) return
    
    const amountStr = manualIngredientAmount.trim()
    const amount = amountStr ? parseFloat(amountStr) : undefined
    
    const unit = manualIngredientUnit.trim() || undefined
    
    const newIngredient: AggregatedIngredient = {
      id: generateUUID(),
      name,
      amount: (amount !== undefined && !isNaN(amount)) ? amount : undefined,
      unit,
      extractedFrom: [],
    }
    
    setManualIngredients(prev => [...prev, newIngredient])
    setManualIngredientName('')
    setManualIngredientAmount('')
    setManualIngredientUnit('')
    setShowManualIngredient(false)
    setIngredientSuggestions([])
  }
  
  const handleRemoveManualIngredient = (id: string) => {
    setManualIngredients(prev => prev.filter(ing => ing.id !== id))
  }

  const handleAddSubRecipe = async (subRecipeUri: string) => {
    // Check for circular reference
    // If editing, we can check for circular references using the recipe URI.
    // When creating a new recipe, we don't have a URI yet, so circular reference
    // checks are skipped during creation. The check will be performed after the
    // recipe is created if needed (though this would require a different UX flow).
    if (recipeUri) {
      const wouldCreateCircular = await wouldCreateCircularReference(
        recipeUri,
        subRecipeUri,
      )

      if (wouldCreateCircular) {
        setSubRecipeError('Adding this recipe would create a circular reference')
        return
      }
    }
    // Note: Self-reference check during creation is not possible since we don't
    // have a recipe URI yet. This is acceptable as users can't add a recipe as
    // its own sub-recipe during creation (the recipe doesn't exist yet).

    // Add sub-recipe
    setSubRecipes(prev => {
      if (prev.includes(subRecipeUri)) return prev
      return [...prev, subRecipeUri]
    })
    
    // Clear search
    setSubRecipeSearchQuery('')
    setSubRecipeSearchResults([])
    setShowSubRecipeSelector(false)
    setSubRecipeError(null)
  }

  const handleRemoveSubRecipe = (subRecipeUri: string) => {
    setSubRecipes(prev => prev.filter(uri => uri !== subRecipeUri))
  }
  
  const validateForm = (): string | null => {
    if (!title.trim()) {
      return 'Title is required'
    }
    
    if (servings < 1) {
      return 'Servings must be at least 1'
    }
    
    const validSteps = steps.filter(step => step.text.trim())
    if (validSteps.length === 0) {
      return 'At least one step is required'
    }
    
    return null
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    
    if (!isAuthenticated) {
      setError('You must be authenticated to create recipes')
      return
    }
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const agent = await getAuthenticatedAgent()
      if (!agent) {
        throw new Error('Failed to authenticate')
      }
      
      // Build ingredients list
      const ingredients: Ingredient[] = aggregatedIngredients.map(ing => ({
        id: ing.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
      }))
      
      // Build steps list with ingredient references
      const recipeSteps: Step[] = steps
        .filter(step => step.text.trim())
        .map((step, index) => {
          const extracted = extractIngredients(step.text)
          const ingredientReferences = extracted.map(extractedIng => {
            // Find the aggregated ingredient this belongs to
            // Prefer exact match (name + unit) to handle multiple unit systems correctly
            const nameMatches = aggregatedIngredients.filter(
              agg => agg.name.toLowerCase() === extractedIng.name.toLowerCase()
            )
            
            // Try exact match first (name + unit)
            let aggregated = nameMatches.find(
              agg => agg.unit === extractedIng.unit
            )
            
            // If no exact match and multiple name matches exist, prefer same unit system
            if (!aggregated && nameMatches.length > 1 && extractedIng.unit) {
              const extractedSystem = getUnitSystem(extractedIng.unit)
              aggregated = nameMatches.find(agg => {
                if (!agg.unit) return false
                return getUnitSystem(agg.unit) === extractedSystem
              })
            }
            
            // Fallback: use first name match only if there's exactly one
            if (!aggregated && nameMatches.length === 1) {
              aggregated = nameMatches[0]
            }
            
            if (!aggregated) return null
            
            return {
              ingredientId: aggregated.id,
              byteStart: extractedIng.byteStart,
              byteEnd: extractedIng.byteEnd,
              amount: extractedIng.amount,
              unit: extractedIng.unit,
            }
          }).filter((ref): ref is NonNullable<typeof ref> => ref !== null)
          
          // Preserve original step ID if in edit mode and step already has an ID
          // (steps are initialized with their original IDs from initialRecipe)
          const stepId = isEditMode && step.id ? step.id : generateUUID()
          
          return {
            id: stepId,
            text: step.text.trim(),
            order: index,
            metadata: ingredientReferences.length > 0
              ? { ingredientReferences }
              : undefined,
          }
        })
      
      // Create recipe
      const recipeData: Omit<Recipe, 'createdAt' | 'updatedAt'> = {
        title: title.trim(),
        servings,
        ingredients,
        steps: recipeSteps,
        subRecipes: subRecipes.length > 0 ? subRecipes : undefined,
      }
      
      let uri: string
      let cid: string
      
      if (isEditMode && recipeUri) {
        // Update existing recipe
        const result = await updateRecipe(agent, recipeUri, recipeData)
        uri = result.uri
        cid = result.cid
        
        // Update IndexedDB cache
        const updatedRecipe: Recipe = {
          ...recipeData,
          createdAt: initialRecipe?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await recipeDB.put(uri, updatedRecipe, cid, false)
      } else {
        // Create new recipe
        const result = await createRecipe(agent, recipeData)
        uri = result.uri
        cid = result.cid
        
        // Cache in IndexedDB
        const recipe: Recipe = {
          ...recipeData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        await recipeDB.put(uri, recipe, cid, false)

        // Add to default collection (auto-created if needed)
        await ensureRecipeInDefaultCollection(uri)

        // Add to selected collections
        for (const collectionUri of selectedCollectionUris) {
          try {
            await addRecipeToCollection(agent, collectionUri, uri)
          } catch (err) {
            // Log but don't fail - collection addition is optional
            console.error(`Failed to add recipe to collection ${collectionUri}:`, err)
          }
        }
      }
      
      setSuccess(true)
      
      // Call success callback if provided
      if (onSuccess) {
        onSuccess(uri)
      } else {
        // Navigate to the recipe view after a short delay
        setTimeout(() => {
          navigate(`/recipe/${encodeURIComponent(uri)}`, { replace: true })
        }, 1500)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create recipe'
      )
      setIsSubmitting(false)
    }
  }
  
  if (success) {
    return (
      <div className={cn('container mx-auto p-4 max-w-2xl', className)}>
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <h2 className="text-xl font-semibold text-green-800 mb-2">
            Recipe {isEditMode ? 'Updated' : 'Created'} Successfully!
          </h2>
          <p className="text-green-700">
            Your recipe has been {isEditMode ? 'updated' : 'saved'} and is now available.
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn('container mx-auto p-4 max-w-2xl', className)}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            {isEditMode ? 'Edit Recipe' : 'Create New Recipe'}
          </h1>
        </div>
        
        {/* Title */}
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Title <span className="text-red-500">*</span>
          </label>
            <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g., Chocolate Chip Cookies"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isSubmitting}
            aria-describedby={error && !title.trim() ? "title-error" : undefined}
          />
          {error && !title.trim() && (
            <p id="title-error" className="mt-1 text-sm text-red-600" role="alert">
              Title is required
            </p>
          )}
        </div>
        
        {/* Servings */}
        <div>
          <label
            htmlFor="servings"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Servings <span className="text-red-500">*</span>
          </label>
            <input
            id="servings"
            type="number"
            min="1"
            value={servings}
            onChange={(e) => handleServingsChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isSubmitting}
            aria-describedby={error && servings < 1 ? "servings-error" : undefined}
          />
          {error && servings < 1 && (
            <p id="servings-error" className="mt-1 text-sm text-red-600" role="alert">
              Servings must be at least 1
            </p>
          )}
        </div>
        
        {/* Steps */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Steps <span className="text-red-500">*</span>
          </label>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={step.id} className="flex gap-2">
                <div className="flex-1">
                  <textarea
                    value={step.text}
                    onChange={(e) => handleStepChange(step.id, e.target.value)}
                    placeholder={`Step ${index + 1}: e.g., Mix 240g flour and 60g sugar`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[60px]"
                    disabled={isSubmitting}
                  />
                </div>
                {steps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(step.id)}
                    className="px-3 py-2 text-red-600 hover:text-red-800 disabled:opacity-50"
                    disabled={isSubmitting}
                    aria-label={`Remove step ${index + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddStep}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              + Add Step
            </button>
          </div>
        </div>
        
        {/* Ingredients (auto-extracted) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Ingredients (auto-extracted from steps)
            </label>
            <button
              type="button"
              onClick={() => setShowManualIngredient(!showManualIngredient)}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {showManualIngredient ? 'Cancel' : '+ Add Manually'}
            </button>
          </div>
          
          {/* Manual ingredient addition */}
          {showManualIngredient && (
            <div className="mb-4 p-4 border border-gray-300 rounded-md bg-gray-50 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ingredient Name
                </label>
                  <input
                  type="text"
                  value={manualIngredientName}
                  onChange={(e) => handleManualIngredientNameChange(e.target.value)}
                  placeholder="e.g., flour"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isSubmitting}
                  aria-describedby="ingredient-suggestions"
                />
                {ingredientSuggestions.length > 0 && (
                  <div id="ingredient-suggestions" className="mt-2 space-y-1" role="listbox" aria-label="Ingredient suggestions">
                    <p className="text-xs text-gray-600">Suggestions:</p>
                    {ingredientSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className="block w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        role="option"
                      >
                        {suggestion.name}
                        {suggestion.amount && suggestion.unit
                          ? ` (${suggestion.amount} ${suggestion.unit})`
                          : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Amount (optional)
                  </label>
                  <input
                    type="text"
                    value={manualIngredientAmount}
                    onChange={(e) => setManualIngredientAmount(e.target.value)}
                    placeholder="e.g., 240"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Unit (optional)
                  </label>
                  <input
                    type="text"
                    value={manualIngredientUnit}
                    onChange={(e) => setManualIngredientUnit(e.target.value)}
                    placeholder="e.g., g"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddManualIngredient}
                disabled={!manualIngredientName.trim() || isSubmitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Ingredient
              </button>
            </div>
          )}
          
          {/* Ingredients list */}
          {aggregatedIngredients.length > 0 ? (
            <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
              <ul className="space-y-2" aria-live="polite" aria-label="Recipe ingredients">
                {aggregatedIngredients.map((ingredient) => {
                  const isManual = manualIngredientIds.has(ingredient.id)
                  return (
                    <li
                      key={ingredient.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-gray-700">
                        {ingredient.amount && ingredient.unit
                          ? `${ingredient.amount} ${ingredient.unit} ${ingredient.name}`
                          : ingredient.name}
                        {isManual && (
                          <span className="ml-2 text-xs text-gray-500">(manual)</span>
                        )}
                      </span>
                      {isManual && (
                        <button
                          type="button"
                          onClick={() => handleRemoveManualIngredient(ingredient.id)}
                          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          disabled={isSubmitting}
                          aria-label={`Remove ${ingredient.name}`}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div className="border border-gray-300 rounded-md p-4 bg-gray-50 text-sm text-gray-500 text-center">
              No ingredients extracted yet. Add steps with ingredient amounts to see them here.
            </div>
          )}
        </div>
        
        {/* Sub-recipes selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Sub-recipes (optional)
            </label>
            <button
              type="button"
              onClick={() => {
                setShowSubRecipeSelector(!showSubRecipeSelector)
                setSubRecipeSearchQuery('')
                setSubRecipeSearchResults([])
                setSubRecipeError(null)
              }}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {showSubRecipeSelector ? 'Cancel' : '+ Add Sub-recipe'}
            </button>
          </div>
          
          {/* Sub-recipe search */}
          {showSubRecipeSelector && (
            <div className="mb-4 p-4 border border-gray-300 rounded-md bg-gray-50 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Search Recipes
                </label>
                <input
                  type="text"
                  value={subRecipeSearchQuery}
                  onChange={(e) => setSubRecipeSearchQuery(e.target.value)}
                  placeholder="Search by recipe title..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isSubmitting || isSearchingSubRecipes}
                />
                {isSearchingSubRecipes && (
                  <p className="mt-1 text-xs text-gray-500">Searching...</p>
                )}
                {subRecipeError && (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {subRecipeError}
                  </p>
                )}
              </div>
              
              {/* Search results */}
              {subRecipeSearchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white">
                  {subRecipeSearchResults.map((recipe) => (
                    <button
                      key={recipe.uri}
                      type="button"
                      onClick={() => handleAddSubRecipe(recipe.uri)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                      disabled={isSubmitting}
                    >
                      <div className="font-medium text-sm text-gray-900">
                        {recipe.title}
                      </div>
                      <div className="text-xs text-gray-500">
                        {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {subRecipeSearchQuery && !isSearchingSubRecipes && subRecipeSearchResults.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">
                  No recipes found matching "{subRecipeSearchQuery}"
                </p>
              )}
            </div>
          )}
          
          {/* Selected sub-recipes */}
          {subRecipes.length > 0 && (
            <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
              <ul className="space-y-2">
                {subRecipes.map((uri) => {
                  const preview = subRecipePreviews.get(uri)
                  return (
                    <li
                      key={uri}
                      className="flex items-center justify-between py-1 border-b border-gray-200 last:border-b-0"
                    >
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">
                          {preview ? preview.title : uri}
                        </span>
                        {preview && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({preview.servings} serving{preview.servings !== 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubRecipe(uri)}
                        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                        disabled={isSubmitting}
                        aria-label={`Remove sub-recipe ${preview?.title || uri}`}
                      >
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {subRecipes.length === 0 && !showSubRecipeSelector && (
            <div className="border border-gray-300 rounded-md p-4 bg-gray-50 text-sm text-gray-500 text-center">
              No sub-recipes added. Click "Add Sub-recipe" to link other recipes.
            </div>
          )}
        </div>
        
        {/* Collections selection */}
        {collections.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Add to Collections (optional)
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
              {collections.map((collection) => {
                const isSelected = selectedCollectionUris.includes(collection.uri)
                return (
                  <label
                    key={collection.uri}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCollectionUris((prev) => [...prev, collection.uri])
                        } else {
                          setSelectedCollectionUris((prev) =>
                            prev.filter((uri) => uri !== collection.uri)
                          )
                        }
                      }}
                      disabled={isSubmitting}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{collection.name}</span>
                    {collection.description && (
                      <span className="text-xs text-gray-500">
                        - {collection.description}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}
        
        {/* Form actions */}
        <div className="flex gap-3 justify-end">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !isAuthenticated}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditMode ? 'Update Recipe' : 'Create Recipe'}
          </button>
        </div>
      </form>
    </div>
  )
}
