/**
 * Recipe Creation Form Component
 * 
 * Allows users to create recipes with natural language input,
 * automatic ingredient extraction, and manual ingredient addition.
 */

import { useState, useCallback, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { extractIngredients, type ExtractedIngredient } from '../utils/ingredientExtraction'
import { createRecipe } from '../services/atproto'
import { getAuthenticatedAgent } from '../services/agent'
import { recipeDB } from '../services/indexeddb'
import { cn } from '../lib/utils'
import type { Recipe, Ingredient, Step } from '../types/recipe'

export interface RecipeCreationFormProps {
  /** Callback when recipe is successfully created */
  onSuccess?: (uri: string) => void
  /** Callback when form is cancelled */
  onCancel?: () => void
  className?: string
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
 * Simple fuzzy matching function for ingredient suggestions
 * Returns a score between 0 and 1, where 1 is an exact match
 */
function fuzzyMatch(query: string, target: string): number {
  const queryLower = query.toLowerCase().trim()
  const targetLower = target.toLowerCase().trim()
  
  if (queryLower === targetLower) return 1
  if (targetLower.includes(queryLower)) return 0.8
  if (queryLower.includes(targetLower)) return 0.6
  
  // Simple Levenshtein-like scoring
  let matches = 0
  for (let i = 0; i < Math.min(queryLower.length, targetLower.length); i++) {
    if (queryLower[i] === targetLower[i]) matches++
  }
  
  return matches / Math.max(queryLower.length, targetLower.length)
}

/**
 * Aggregate ingredients from all steps, combining duplicates
 */
function aggregateIngredients(
  steps: FormStep[],
  manualIngredients: AggregatedIngredient[]
): AggregatedIngredient[] {
  const ingredientMap = new Map<string, AggregatedIngredient>()
  
  // Add manual ingredients first
  for (const manual of manualIngredients) {
    const key = manual.name.toLowerCase()
    ingredientMap.set(key, { ...manual })
  }
  
  // Extract and aggregate from steps
  for (const step of steps) {
    if (!step.text.trim()) continue
    
    const extracted = extractIngredients(step.text)
    
    for (const extractedIng of extracted) {
      const key = extractedIng.name.toLowerCase()
      const existing = ingredientMap.get(key)
      
      if (existing) {
        // Combine amounts if same unit, otherwise keep separate entries
        if (existing.unit === extractedIng.unit && existing.amount && extractedIng.amount) {
          existing.amount = existing.amount + extractedIng.amount
        } else if (!existing.unit && extractedIng.unit) {
          // Update with unit if existing doesn't have one
          existing.unit = extractedIng.unit
          existing.amount = extractedIng.amount
        } else if (existing.unit && !extractedIng.unit && existing.amount) {
          // Keep existing unit if new one doesn't have unit
          // Don't update amount
        }
        existing.extractedFrom.push(extractedIng)
      } else {
        ingredientMap.set(key, {
          id: crypto.randomUUID(),
          name: extractedIng.name,
          amount: extractedIng.amount,
          unit: extractedIng.unit,
          extractedFrom: [extractedIng],
        })
      }
    }
  }
  
  return Array.from(ingredientMap.values())
}

/**
 * Get ingredient suggestions based on existing ingredients
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
    .filter(item => item.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.ingredient)
  
  return scored
}

export function RecipeCreationForm({
  onSuccess,
  onCancel,
  className,
}: RecipeCreationFormProps) {
  const { isAuthenticated } = useAuth()
  const [title, setTitle] = useState('')
  const [servings, setServings] = useState<number>(1)
  const [steps, setSteps] = useState<FormStep[]>([{ id: crypto.randomUUID(), text: '' }])
  const [manualIngredients, setManualIngredients] = useState<AggregatedIngredient[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // Manual ingredient addition state
  const [showManualIngredient, setShowManualIngredient] = useState(false)
  const [manualIngredientName, setManualIngredientName] = useState('')
  const [manualIngredientAmount, setManualIngredientAmount] = useState('')
  const [manualIngredientUnit, setManualIngredientUnit] = useState('')
  const [ingredientSuggestions, setIngredientSuggestions] = useState<AggregatedIngredient[]>([])
  
  // Aggregate all ingredients (from steps + manual)
  const aggregatedIngredients = useMemo(() => {
    return aggregateIngredients(steps, manualIngredients)
  }, [steps, manualIngredients])
  
  // Update suggestions when manual ingredient name changes
  const updateSuggestions = useCallback((name: string) => {
    const suggestions = getIngredientSuggestions(name, aggregatedIngredients)
    setIngredientSuggestions(suggestions)
  }, [aggregatedIngredients])
  
  const handleStepChange = (id: string, text: string) => {
    setSteps(prev => prev.map(step => step.id === id ? { ...step, text } : step))
  }
  
  const handleAddStep = () => {
    setSteps(prev => [...prev, { id: crypto.randomUUID(), text: '' }])
  }
  
  const handleRemoveStep = (id: string) => {
    setSteps(prev => {
      const filtered = prev.filter(step => step.id !== id)
      return filtered.length === 0 ? [{ id: crypto.randomUUID(), text: '' }] : filtered
    })
  }
  
  const handleManualIngredientNameChange = (value: string) => {
    setManualIngredientName(value)
    updateSuggestions(value)
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
    
    const amount = manualIngredientAmount.trim()
      ? parseFloat(manualIngredientAmount.trim())
      : undefined
    
    const unit = manualIngredientUnit.trim() || undefined
    
    const newIngredient: AggregatedIngredient = {
      id: crypto.randomUUID(),
      name,
      amount: isNaN(amount!) ? undefined : amount,
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
            const aggregated = aggregatedIngredients.find(
              agg => agg.name.toLowerCase() === extractedIng.name.toLowerCase()
            )
            
            if (!aggregated) return null
            
            return {
              ingredientId: aggregated.id,
              byteStart: extractedIng.byteStart,
              byteEnd: extractedIng.byteEnd,
              amount: extractedIng.amount,
              unit: extractedIng.unit,
            }
          }).filter((ref): ref is NonNullable<typeof ref> => ref !== null)
          
          return {
            id: crypto.randomUUID(),
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
      }
      
      const { uri, cid } = await createRecipe(agent, recipeData)
      
      // Cache in IndexedDB
      const recipe: Recipe = {
        ...recipeData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await recipeDB.put(uri, recipe, cid, false)
      
      setSuccess(true)
      
      // Call success callback after a brief delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(uri)
        }
      }, 1000)
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
            Recipe Created Successfully!
          </h2>
          <p className="text-green-700">
            Your recipe has been saved and is now available.
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn('container mx-auto p-4 max-w-2xl', className)}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Recipe</h1>
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
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Chocolate Chip Cookies"
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isSubmitting}
          />
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
            onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={isSubmitting}
          />
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
                />
                {ingredientSuggestions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-600">Suggestions:</p>
                    {ingredientSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className="block w-full text-left px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
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
              <ul className="space-y-2">
                {aggregatedIngredients.map((ingredient) => {
                  const isManual = manualIngredients.some(m => m.id === ingredient.id)
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
            {isSubmitting ? 'Saving...' : 'Create Recipe'}
          </button>
        </div>
      </form>
    </div>
  )
}
