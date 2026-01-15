/**
 * Recipe Scaling Utilities
 * 
 * Provides functions for adjusting recipe serving sizes and recalculating
 * ingredient amounts and step text accordingly.
 * 
 * Key principles:
 * - Original recipe data is never modified
 * - Creates an adjusted view with scaled amounts
 * - Regenerates step text with updated ingredient amounts
 * - Re-aggregates ingredients after scaling
 */

import type { Recipe, Ingredient, Step, IngredientReference } from '../types/recipe'
import { extractIngredients, type ExtractedIngredient } from './ingredientExtraction'
import { aggregateIngredients, aggregatedToRecipeIngredients } from './ingredientAggregation'
import { formatAmount } from './unitConversion'

/**
 * Constants for recipe scaling
 */
const ROUNDING_PRECISION = 2 // Decimal places for rounding
const MIN_SERVING_SIZE = 0.25
const MAX_SERVING_SIZE = 100
const POSITION_MATCH_TOLERANCE_PERCENT = 0.1 // 10% of text length
const MIN_POSITION_MATCH_TOLERANCE = 50 // Minimum tolerance in bytes
const MAX_POSITION_MATCH_TOLERANCE = 200 // Maximum tolerance in bytes

/**
 * Converts a byte offset to a character position in a string.
 * Handles multi-byte Unicode characters correctly by iterating through
 * the string and tracking byte positions.
 * 
 * @param text - The text string
 * @param byteOffset - The byte offset to convert
 * @returns The character position corresponding to the byte offset
 */
function byteOffsetToCharPosition(text: string, byteOffset: number): number {
  const encoder = new TextEncoder()
  let byteCount = 0
  let charIndex = 0
  
  // Iterate through characters, encoding each to track byte position
  for (let i = 0; i < text.length; i++) {
    const charBytes = encoder.encode(text[i]).length
    if (byteCount + charBytes > byteOffset) {
      // The byte offset falls within this character
      // Return the character index (we can't split multi-byte characters)
      return charIndex
    }
    byteCount += charBytes
    charIndex++
  }
  
  // If byte offset is beyond the end, return the last character index
  return charIndex
}

/**
 * Scaled recipe view - represents a recipe with adjusted serving size
 * Original recipe data is preserved, only calculated values are adjusted
 */
export interface ScaledRecipe {
  originalRecipe: Recipe
  adjustedServings: number
  multiplier: number
  ingredients: Ingredient[]
  steps: Step[]
}

/**
 * Calculate the serving multiplier for scaling
 * 
 * @param originalServings - Original number of servings
 * @param newServings - New number of servings
 * @returns Multiplier to apply to ingredient amounts
 */
export function calculateServingMultiplier(
  originalServings: number,
  newServings: number
): number {
  if (originalServings <= 0 || newServings <= 0) {
    throw new Error('Servings must be greater than zero')
  }
  
  return newServings / originalServings
}

/**
 * Scale an ingredient amount by a multiplier
 * 
 * @param amount - Original amount
 * @param multiplier - Multiplier to apply
 * @returns Scaled amount (rounded to ROUNDING_PRECISION decimal places for display)
 */
export function scaleIngredientAmount(
  amount: number | undefined,
  multiplier: number
): number | undefined {
  if (amount === undefined) {
    return undefined
  }
  
  const scaled = amount * multiplier
  // Round to specified precision, but preserve whole numbers
  const factor = Math.pow(10, ROUNDING_PRECISION)
  return Math.round(scaled * factor) / factor
}

/**
 * Regenerate step text with scaled ingredient amounts
 * 
 * This function takes the original step text and replaces ingredient amounts
 * with scaled values based on the multiplier.
 * 
 * @param stepText - Original step text
 * @param multiplier - Multiplier to apply to amounts
 * @returns New step text with scaled amounts
 */
export function regenerateStepText(
  stepText: string,
  multiplier: number
): string {
  if (!stepText || stepText.trim().length === 0) {
    return stepText
  }
  
  // Extract all ingredients from the step text
  const extracted = extractIngredients(stepText)
  
  if (extracted.length === 0) {
    return stepText
  }
  
  // Build a map of character positions to scaled amounts
  const replacements: Array<{ start: number; end: number; replacement: string }> = []
  
  for (const ing of extracted) {
    if (ing.amount === undefined) {
      continue
    }
    
    // Skip ingredients that are clearly not real ingredients
    // (e.g., temperatures like "350°F", percentages, etc.)
    const name = ing.name.toLowerCase().trim()
    const nonIngredientPatterns = [
      /^[°º]?[cf]$/i, // Temperature units: °F, °C, F, C
      /^%$/, // Percentages
      /^\d+$/, // Just numbers
    ]
    
    if (nonIngredientPatterns.some(pattern => pattern.test(name))) {
      continue
    }
    
    // Only scale ingredients that have units or are clearly ingredient names
    // Skip standalone numbers (like temperatures) that might be incorrectly extracted
    if (!ing.unit) {
      // Check if this looks like a real ingredient (has a name after the amount)
      // If byteEnd is very close to byteStart, it's probably not a real ingredient
      if (ing.byteEnd - ing.byteStart < 5) {
        continue
      }
    }
    
    const scaledAmount = scaleIngredientAmount(ing.amount, multiplier)
    if (scaledAmount === undefined) {
      continue
    }
    
    // Convert byte offsets to character positions using robust helper function
    // This handles multi-byte Unicode characters correctly
    const startChar = byteOffsetToCharPosition(stepText, ing.byteStart)
    
    // Find the amount in the text (number, fraction, or mixed number)
    const afterStart = stepText.slice(startChar)
    const amountMatch = afterStart.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/)
    if (!amountMatch) {
      continue
    }
    
    const amountEndChar = startChar + amountMatch[0].length
    const formattedAmount = formatAmount(scaledAmount)
    
    replacements.push({
      start: startChar,
      end: amountEndChar,
      replacement: formattedAmount,
    })
  }
  
  // Sort replacements by position (descending) to replace from end to start
  // This prevents offset issues when replacing text
  replacements.sort((a, b) => b.start - a.start)
  
  // Apply replacements from end to start
  let result = stepText
  for (const replacement of replacements) {
    result = result.slice(0, replacement.start) + 
             replacement.replacement + 
             result.slice(replacement.end)
  }
  
  return result
}

/**
 * Update ingredient references in step metadata after scaling
 * 
 * @param references - Original ingredient references
 * @param multiplier - Multiplier to apply
 * @param scaledStepText - The regenerated step text (for recalculating byte offsets)
 * @returns Updated ingredient references with scaled amounts
 */
export function updateIngredientReferences(
  references: IngredientReference[] | undefined,
  multiplier: number,
  scaledStepText: string
): IngredientReference[] | undefined {
  if (!references || references.length === 0) {
    return references
  }
  
  // Re-extract ingredients from scaled text to get new byte offsets
  const extracted = extractIngredients(scaledStepText)
  
  // Map extracted ingredients by name and approximate position
  const updatedReferences: IngredientReference[] = []
  const usedExtracted = new Set<number>() // Track which extracted ingredients we've used
  
  for (const ref of references) {
    // Find matching extracted ingredient
    // Match by position proximity first, then by amount
    let matching: ExtractedIngredient | undefined
    let matchingIndex: number | undefined
    
    // First try to find by position proximity (within reasonable range)
    // After scaling, positions may shift, so use a calculated tolerance based on text length
    // Tolerance is 10% of text length, with min/max bounds
    const textLength = scaledStepText.length
    const tolerance = Math.max(
      MIN_POSITION_MATCH_TOLERANCE,
      Math.min(
        MAX_POSITION_MATCH_TOLERANCE,
        Math.floor(textLength * POSITION_MATCH_TOLERANCE_PERCENT)
      )
    )
    
    for (let i = 0; i < extracted.length; i++) {
      if (usedExtracted.has(i)) continue
      
      const ext = extracted[i]
      const positionMatch = Math.abs(ext.byteStart - ref.byteStart) < tolerance
      
      if (positionMatch) {
        matching = ext
        matchingIndex = i
        break
      }
    }
    
    // If no match by position, try to find by matching the original amount pattern
    // (scaled amounts should be proportional)
    if (!matching && ref.amount !== undefined) {
      const expectedScaled = ref.amount * multiplier
      for (let i = 0; i < extracted.length; i++) {
        if (usedExtracted.has(i)) continue
        
        const ext = extracted[i]
        if (ext.amount !== undefined) {
          // Allow small rounding differences
          if (Math.abs(ext.amount - expectedScaled) < 0.01) {
            matching = ext
            matchingIndex = i
            break
          }
        }
      }
    }
    
    if (matching && matchingIndex !== undefined) {
      // Mark this extracted ingredient as used
      usedExtracted.add(matchingIndex)
      
      // Use the amount from the extracted ingredient (already scaled in step text)
      // Don't scale again - the step text already has scaled amounts
      updatedReferences.push({
        ingredientId: ref.ingredientId,
        byteStart: matching.byteStart,
        byteEnd: matching.byteEnd,
        amount: matching.amount, // Already scaled in step text
        unit: matching.unit || ref.unit,
      })
    } else {
      // Keep original reference but scale amount (if not found in extracted, scale manually)
      updatedReferences.push({
        ...ref,
        amount: ref.amount !== undefined
          ? scaleIngredientAmount(ref.amount, multiplier)
          : ref.amount,
      })
    }
  }
  
  return updatedReferences
}

/**
 * Scale a recipe to a new serving size
 * 
 * This function creates an adjusted view of the recipe with scaled ingredient
 * amounts and regenerated step text. The original recipe is never modified.
 * 
 * @param recipe - Original recipe
 * @param newServings - New number of servings
 * @returns Scaled recipe view with adjusted amounts and step text
 * 
 * @example
 * const original = { servings: 4, ingredients: [{ name: 'flour', amount: 240, unit: 'g' }], ... }
 * const scaled = scaleRecipe(original, 8)
 * // scaled.adjustedServings = 8
 * // scaled.multiplier = 2
 * // scaled.ingredients[0].amount = 480
 */
export function scaleRecipe(
  recipe: Recipe,
  newServings: number
): ScaledRecipe {
  if (newServings <= 0) {
    throw new Error('New servings must be greater than zero')
  }
  
  const multiplier = calculateServingMultiplier(recipe.servings, newServings)
  
  // Scale ingredient amounts
  const scaledIngredients: Ingredient[] = recipe.ingredients.map(ing => ({
    ...ing,
    amount: scaleIngredientAmount(ing.amount, multiplier),
  }))
  
  // Regenerate step text with scaled amounts
  const scaledSteps: Step[] = recipe.steps.map(step => {
    const scaledText = regenerateStepText(step.text, multiplier)
    
    // Update ingredient references in metadata
    const updatedMetadata = step.metadata ? {
      ...step.metadata,
      ingredientReferences: updateIngredientReferences(
        step.metadata.ingredientReferences,
        multiplier,
        scaledText
      ),
    } : undefined
    
    return {
      ...step,
      text: scaledText,
      metadata: updatedMetadata,
    }
  })
  
  // Re-aggregate ingredients from scaled steps
  // Extract all ingredients from scaled steps
  const allExtracted: ExtractedIngredient[] = []
  for (const step of scaledSteps) {
    if (step.text.trim()) {
      const extracted = extractIngredients(step.text)
      allExtracted.push(...extracted)
    }
  }
  
  // Aggregate and convert to recipe ingredients format
  const aggregated = aggregateIngredients(allExtracted)
  const reAggregatedIngredients = aggregatedToRecipeIngredients(aggregated)
  
  // Merge with scaled ingredients (prefer scaled ingredients for amounts,
  // but use re-aggregated for structure)
  const finalIngredients: Ingredient[] = scaledIngredients.map(ing => {
    // Find matching aggregated ingredient
    const matching = reAggregatedIngredients.find(
      agg => agg.name.toLowerCase() === ing.name.toLowerCase()
    )
    
    if (matching && matching.amount !== undefined) {
      // Use aggregated amount (may be more accurate after re-aggregation)
      return {
        ...ing,
        amount: matching.amount,
        unit: matching.unit || ing.unit,
      }
    }
    
    return ing
  })
  
  // Add any new ingredients from aggregation that weren't in original
  // Use a timestamp and counter to ensure unique IDs
  const timestamp = Date.now()
  let counter = 0
  for (const agg of reAggregatedIngredients) {
    const exists = finalIngredients.some(
      ing => ing.name.toLowerCase() === agg.name.toLowerCase()
    )
    if (!exists) {
      // Generate unique ID using timestamp, counter, and random component
      // The counter ensures uniqueness even if called multiple times in the same millisecond
      const uniqueId = `scaled-${timestamp}-${counter}-${Math.random().toString(36).substring(2, 9)}`
      counter++
      finalIngredients.push({
        id: uniqueId,
        name: agg.name,
        amount: agg.amount,
        unit: agg.unit,
      })
    }
  }
  
  return {
    originalRecipe: recipe,
    adjustedServings: newServings,
    multiplier,
    ingredients: finalIngredients,
    steps: scaledSteps,
  }
}
