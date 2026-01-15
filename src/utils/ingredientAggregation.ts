/**
 * Ingredient Aggregation Utilities
 * 
 * Provides functions for aggregating ingredients across recipe steps,
 * with proper unit conversion and unit system awareness.
 * Critical: Does NOT mix metric and imperial units when aggregating.
 */

import type { ExtractedIngredient } from './ingredientExtraction'
import {
  getUnitSystem,
  areSameSystem,
  areSameType,
  convertUnit,
  normalizeAmount,
  normalizeUnit,
  type UnitSystem,
} from './unitConversion'
import { formatAmount } from './unitConversion'

export interface AggregatedIngredientEntry {
  amount: number
  unit: string
  system: UnitSystem
}

export interface AggregatedIngredient {
  name: string
  entries: AggregatedIngredientEntry[] // Separate entries for different unit systems
  extractedFrom: ExtractedIngredient[]
}

/**
 * Check if two ingredient names match (case-insensitive)
 */
function ingredientNamesMatch(name1: string, name2: string): boolean {
  return name1.toLowerCase().trim() === name2.toLowerCase().trim()
}

/**
 * Find an existing aggregated ingredient by name
 */
function findAggregatedIngredient(
  ingredients: AggregatedIngredient[],
  name: string
): AggregatedIngredient | undefined {
  return ingredients.find(ing => ingredientNamesMatch(ing.name, name))
}

/**
 * Add an extracted ingredient to an aggregated ingredient
 * Handles unit system separation - metric and imperial are kept separate
 */
function addToAggregated(
  aggregated: AggregatedIngredient,
  extracted: ExtractedIngredient
): void {
  // Track where this ingredient was extracted from
  aggregated.extractedFrom.push(extracted)
  
  // If no amount or unit, nothing to aggregate
  if (extracted.amount === undefined || !extracted.unit) {
    return
  }
  
  const system = getUnitSystem(extracted.unit)
  
  // Find existing entry with same unit system
  const existingEntry = aggregated.entries.find(
    entry => entry.system === system && areSameSystem(entry.unit, extracted.unit)
  )
  
  if (existingEntry) {
    // Same system - try to combine if same type
    if (areSameType(existingEntry.unit, extracted.unit)) {
      // Try to convert and combine
      const converted = convertUnit(extracted.amount, extracted.unit, existingEntry.unit)
      
      if (converted !== null) {
        // Successfully converted - combine amounts
        existingEntry.amount += converted
      } else if (existingEntry.unit === extracted.unit) {
        // Same unit - directly combine
        existingEntry.amount += extracted.amount
      } else {
        // Can't convert but different units in same system - create new entry
        aggregated.entries.push({
          amount: extracted.amount,
          unit: extracted.unit,
          system,
        })
      }
    } else {
      // Different types in same system - create new entry
      aggregated.entries.push({
        amount: extracted.amount,
        unit: extracted.unit,
        system,
      })
    }
  } else {
    // No existing entry for this system - create new entry
    aggregated.entries.push({
      amount: extracted.amount,
      unit: extracted.unit,
      system,
    })
  }
}

/**
 * Normalize all entries in an aggregated ingredient to preferred units
 */
function normalizeAggregatedIngredient(aggregated: AggregatedIngredient): void {
  aggregated.entries = aggregated.entries.map(entry => {
    const normalized = normalizeAmount(entry.amount, entry.unit)
    return {
      amount: normalized.value,
      unit: normalized.unit,
      system: entry.system,
    }
  })
}

/**
 * Format an aggregated ingredient for display
 * Handles multiple unit systems by showing them separately
 * Example: "240g and 1oz flour" (metric and imperial)
 */
export function formatAggregatedIngredient(aggregated: AggregatedIngredient): string {
  if (aggregated.entries.length === 0) {
    return aggregated.name
  }
  
  // Normalize entries first
  normalizeAggregatedIngredient(aggregated)
  
  // Group entries by system
  const metricEntries = aggregated.entries.filter(e => e.system === 'metric')
  const imperialEntries = aggregated.entries.filter(e => e.system === 'imperial')
  const otherEntries = aggregated.entries.filter(e => e.system === 'none')
  
  const parts: string[] = []
  
  // Combine metric entries
  if (metricEntries.length > 0) {
    const combined = combineEntries(metricEntries)
    if (combined) {
      parts.push(`${formatAmount(combined.amount)}${combined.unit}`)
    } else {
      // Can't combine - show separately
      const metricAmounts = metricEntries.map(e => `${formatAmount(e.amount)}${e.unit}`).join(' + ')
      parts.push(metricAmounts)
    }
  }
  
  // Combine imperial entries
  if (imperialEntries.length > 0) {
    const combined = combineEntries(imperialEntries)
    if (combined) {
      parts.push(`${formatAmount(combined.amount)}${combined.unit}`)
    } else {
      // Can't combine - show separately
      const imperialAmounts = imperialEntries.map(e => `${formatAmount(e.amount)}${e.unit}`).join(' + ')
      parts.push(imperialAmounts)
    }
  }
  
  // Add other entries (count units, etc.)
  if (otherEntries.length > 0) {
    const combined = combineEntries(otherEntries)
    if (combined) {
      parts.push(`${formatAmount(combined.amount)}${combined.unit || ''}`)
    } else {
      const otherAmounts = otherEntries.map(e => `${formatAmount(e.amount)}${e.unit || ''}`).join(' + ')
      parts.push(otherAmounts)
    }
  }
  
  // Join with " and " if multiple systems, otherwise just the amounts
  const amountsStr = parts.length > 1 ? parts.join(' and ') : parts[0]
  
  return `${amountsStr} ${aggregated.name}`
}

/**
 * Aggregate ingredients from extracted ingredients
 * Combines same ingredients with proper unit conversion and system separation
 * 
 * @param extractedIngredients - Array of extracted ingredients from all steps
 * @returns Array of aggregated ingredients
 * 
 * @example
 * Input: [
 *   { name: 'flour', amount: 240, unit: 'g' },
 *   { name: 'flour', amount: 100, unit: 'g' },
 *   { name: 'flour', amount: 1, unit: 'oz' }
 * ]
 * Output: [
 *   {
 *     name: 'flour',
 *     entries: [
 *       { amount: 340, unit: 'g', system: 'metric' },
 *       { amount: 1, unit: 'oz', system: 'imperial' }
 *     ]
 *   }
 * ]
 */
export function aggregateIngredients(
  extractedIngredients: ExtractedIngredient[]
): AggregatedIngredient[] {
  const aggregated: AggregatedIngredient[] = []
  
  for (const extracted of extractedIngredients) {
    const existing = findAggregatedIngredient(aggregated, extracted.name)
    
    if (existing) {
      addToAggregated(existing, extracted)
    } else {
      // Create new aggregated ingredient
      const newAggregated: AggregatedIngredient = {
        name: extracted.name,
        entries: [],
        extractedFrom: [extracted],
      }
      
      // Add the extracted ingredient to it
      if (extracted.amount !== undefined && extracted.unit) {
        const system = getUnitSystem(extracted.unit)
        newAggregated.entries.push({
          amount: extracted.amount,
          unit: extracted.unit,
          system,
        })
      }
      
      aggregated.push(newAggregated)
    }
  }
  
  // Normalize all aggregated ingredients
  aggregated.forEach(normalizeAggregatedIngredient)
  
  return aggregated
}

/**
 * Convert aggregated ingredients to the format expected by Recipe type
 * Combines entries within the same system, but keeps different systems separate
 */
export function aggregatedToRecipeIngredients(
  aggregated: AggregatedIngredient[]
): Array<{ name: string; amount?: number; unit?: string }> {
  return aggregated.flatMap(agg => {
    // If no entries, return single ingredient without amount/unit
    if (agg.entries.length === 0) {
      return [{ name: agg.name }]
    }
    
    // Group by system
    const metricEntries = agg.entries.filter(e => e.system === 'metric')
    const imperialEntries = agg.entries.filter(e => e.system === 'imperial')
    const otherEntries = agg.entries.filter(e => e.system === 'none')
    
    const result: Array<{ name: string; amount?: number; unit?: string }> = []
    
    // Combine metric entries
    if (metricEntries.length > 0) {
      // Try to combine all metric entries into one
      const combinedMetric = combineEntries(metricEntries)
      if (combinedMetric) {
        result.push({
          name: agg.name,
          amount: combinedMetric.amount,
          unit: combinedMetric.unit,
        })
      } else {
        // Can't combine - add separately
        metricEntries.forEach(entry => {
          result.push({
            name: agg.name,
            amount: entry.amount,
            unit: entry.unit,
          })
        })
      }
    }
    
    // Combine imperial entries
    if (imperialEntries.length > 0) {
      const combinedImperial = combineEntries(imperialEntries)
      if (combinedImperial) {
        result.push({
          name: agg.name,
          amount: combinedImperial.amount,
          unit: combinedImperial.unit,
        })
      } else {
        imperialEntries.forEach(entry => {
          result.push({
            name: agg.name,
            amount: entry.amount,
            unit: entry.unit,
          })
        })
      }
    }
    
    // Add other entries
    otherEntries.forEach(entry => {
      result.push({
        name: agg.name,
        amount: entry.amount,
        unit: entry.unit || undefined,
      })
    })
    
    return result
  })
}

/**
 * Try to combine multiple entries into a single entry
 * Returns null if entries can't be combined
 */
function combineEntries(
  entries: AggregatedIngredientEntry[]
): { amount: number; unit: string } | null {
  if (entries.length === 0) return null
  if (entries.length === 1) {
    return { amount: entries[0].amount, unit: entries[0].unit }
  }
  
  // All entries must be same system
  const system = entries[0].system
  if (!entries.every(e => e.system === system)) return null
  
  // Try to normalize to preferred unit
  const preferredUnit = normalizeUnit(entries[0].unit)
  
  // Convert all to preferred unit and sum
  let total = 0
  for (const entry of entries) {
    if (entry.unit === preferredUnit) {
      total += entry.amount
    } else {
      const converted = convertUnit(entry.amount, entry.unit, preferredUnit)
      if (converted === null) {
        // Can't convert - can't combine
        return null
      }
      total += converted
    }
  }
  
  return { amount: total, unit: preferredUnit }
}
