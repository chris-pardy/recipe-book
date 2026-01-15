/**
 * Unit Conversion Utilities
 * 
 * Provides functions for converting between different units of measurement,
 * with support for weight, volume, and weight-to-volume conversions.
 * Handles both metric and imperial unit systems.
 */

export type UnitSystem = 'metric' | 'imperial' | 'none'

export interface UnitInfo {
  name: string
  system: UnitSystem
  type: 'weight' | 'volume' | 'count'
  baseUnit?: string // Base unit for conversions within the same system
  toBase?: number // Conversion factor to base unit
}

/**
 * Unit definitions with conversion factors
 */
export const UNIT_DEFINITIONS: Record<string, UnitInfo> = {
  // Metric weight
  kg: { name: 'kg', system: 'metric', type: 'weight', baseUnit: 'g', toBase: 1000 },
  g: { name: 'g', system: 'metric', type: 'weight', baseUnit: 'g', toBase: 1 },
  mg: { name: 'mg', system: 'metric', type: 'weight', baseUnit: 'g', toBase: 0.001 },
  
  // Metric volume
  l: { name: 'l', system: 'metric', type: 'volume', baseUnit: 'ml', toBase: 1000 },
  ml: { name: 'ml', system: 'metric', type: 'volume', baseUnit: 'ml', toBase: 1 },
  
  // Imperial weight
  lb: { name: 'lb', system: 'imperial', type: 'weight', baseUnit: 'oz', toBase: 16 },
  oz: { name: 'oz', system: 'imperial', type: 'weight', baseUnit: 'oz', toBase: 1 },
  
  // Imperial volume
  gal: { name: 'gal', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 128 },
  qt: { name: 'qt', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 32 },
  pt: { name: 'pt', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 16 },
  'fl oz': { name: 'fl oz', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 1 },
  cup: { name: 'cup', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 8 },
  tbsp: { name: 'tbsp', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 0.5 },
  tsp: { name: 'tsp', system: 'imperial', type: 'volume', baseUnit: 'fl oz', toBase: 1/6 },
  
  // Common cooking units (no system)
  pinch: { name: 'pinch', system: 'none', type: 'count' },
  dash: { name: 'dash', system: 'none', type: 'count' },
  sprig: { name: 'sprig', system: 'none', type: 'count' },
  clove: { name: 'clove', system: 'none', type: 'count' },
  head: { name: 'head', system: 'none', type: 'count' },
  bunch: { name: 'bunch', system: 'none', type: 'count' },
}

/**
 * Get unit information for a given unit string
 */
export function getUnitInfo(unit?: string): UnitInfo | null {
  if (!unit) return null
  return UNIT_DEFINITIONS[unit.toLowerCase()] || null
}

/**
 * Get the unit system for a given unit
 */
export function getUnitSystem(unit?: string): UnitSystem {
  const info = getUnitInfo(unit)
  return info?.system || 'none'
}

/**
 * Check if two units are in the same system
 */
export function areSameSystem(unit1?: string, unit2?: string): boolean {
  const system1 = getUnitSystem(unit1)
  const system2 = getUnitSystem(unit2)
  
  // Both must have a system and be the same
  if (system1 === 'none' || system2 === 'none') {
    return false
  }
  
  return system1 === system2
}

/**
 * Check if two units are the same type (weight, volume, count)
 */
export function areSameType(unit1?: string, unit2?: string): boolean {
  const info1 = getUnitInfo(unit1)
  const info2 = getUnitInfo(unit2)
  
  if (!info1 || !info2) return false
  
  return info1.type === info2.type
}

/**
 * Convert a value from one unit to another within the same system and type
 * Returns null if conversion is not possible
 */
export function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const fromInfo = getUnitInfo(fromUnit)
  const toInfo = getUnitInfo(toUnit)
  
  if (!fromInfo || !toInfo) return null
  
  // Must be same system and type
  if (fromInfo.system !== toInfo.system || fromInfo.type !== toInfo.type) {
    return null
  }
  
  // Can't convert count units
  if (fromInfo.type === 'count') return null
  
  // Must have base unit and conversion factors
  if (!fromInfo.baseUnit || !fromInfo.toBase || !toInfo.baseUnit || !toInfo.toBase) {
    return null
  }
  
  // Convert to base unit, then to target unit
  const baseValue = value * fromInfo.toBase
  const convertedValue = baseValue / toInfo.toBase
  
  return convertedValue
}

/**
 * Normalize a unit to a preferred unit within the same system
 * Prefers metric units (g, ml) but allows imperial
 */
export function normalizeUnit(unit?: string): string {
  if (!unit) return ''
  
  const info = getUnitInfo(unit)
  if (!info) return unit
  
  // For metric, prefer g for weight, ml for volume
  if (info.system === 'metric') {
    if (info.type === 'weight') return 'g'
    if (info.type === 'volume') return 'ml'
  }
  
  // For imperial, prefer oz for weight, fl oz for volume
  if (info.system === 'imperial') {
    if (info.type === 'weight') return 'oz'
    if (info.type === 'volume') return 'fl oz'
  }
  
  // For count units or unknown, return as-is
  return unit
}

/**
 * Convert and normalize a value to the preferred unit in its system
 * Returns the normalized value and unit
 */
export function normalizeAmount(
  value: number,
  unit?: string
): { value: number; unit: string } {
  if (!unit) return { value, unit: '' }
  
  const normalizedUnit = normalizeUnit(unit)
  
  // If already normalized, return as-is
  if (normalizedUnit === unit) {
    return { value, unit }
  }
  
  // Try to convert
  const converted = convertUnit(value, unit, normalizedUnit)
  if (converted !== null) {
    return { value: converted, unit: normalizedUnit }
  }
  
  // If conversion failed, return original
  return { value, unit }
}

/**
 * Weight-to-volume conversions for common ingredients
 * These are approximate conversions based on typical ingredient densities
 */
const WEIGHT_TO_VOLUME_CONVERSIONS: Record<string, { gPerCup: number; gPerMl: number }> = {
  // Common baking ingredients
  flour: { gPerCup: 120, gPerMl: 0.5 },
  sugar: { gPerCup: 200, gPerMl: 0.85 },
  'brown sugar': { gPerCup: 220, gPerMl: 0.93 },
  butter: { gPerCup: 227, gPerMl: 0.96 },
  'cocoa powder': { gPerCup: 85, gPerMl: 0.36 },
  
  // Common liquids (approximate - water is 1g/ml)
  water: { gPerCup: 240, gPerMl: 1 },
  milk: { gPerCup: 240, gPerMl: 1 },
  'heavy cream': { gPerCup: 240, gPerMl: 1 },
}

/**
 * Convert weight to volume for a specific ingredient
 * Returns null if conversion is not available
 * 
 * Note: This function allows cross-system conversions (e.g., g to cup)
 * because it uses ingredient-specific density data.
 */
export function convertWeightToVolume(
  value: number,
  fromUnit: string,
  toUnit: string,
  ingredientName: string
): number | null {
  const fromInfo = getUnitInfo(fromUnit)
  const toInfo = getUnitInfo(toUnit)
  
  if (!fromInfo || !toInfo) return null
  
  // Must be converting from weight to volume
  if (fromInfo.type !== 'weight' || toInfo.type !== 'volume') {
    return null
  }
  
  // Find ingredient conversion data
  const ingredientKey = ingredientName.toLowerCase()
  const conversion = WEIGHT_TO_VOLUME_CONVERSIONS[ingredientKey]
  
  if (!conversion) return null
  
  // Convert to grams first
  const grams = convertUnit(value, fromUnit, 'g')
  if (grams === null) return null
  
  // Convert grams to ml using gPerMl
  const ml = grams / conversion.gPerMl
  
  // Convert ml to target unit
  // If target is metric (ml, l), use normal conversion
  if (toInfo.system === 'metric') {
    return convertUnit(ml, 'ml', toUnit)
  }
  
  // If target is imperial, we need to convert ml to the target unit
  // Use the gPerCup conversion for imperial units
  // First convert to cups, then to target unit
  const cups = grams / conversion.gPerCup
  if (toUnit === 'cup') {
    return cups
  }
  
  // Convert from cups to target imperial unit
  return convertUnit(cups, 'cup', toUnit)
}

/**
 * Format a number with appropriate precision
 */
export function formatAmount(value: number): string {
  // If it's a whole number, return as integer
  if (value % 1 === 0) {
    return value.toString()
  }
  
  // For decimals, use up to 2 decimal places, removing trailing zeros
  return value.toFixed(2).replace(/\.?0+$/, '')
}
