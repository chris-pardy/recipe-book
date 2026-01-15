/**
 * Ingredient Extraction Utility
 * 
 * Extracts structured ingredient data from natural language recipe step text.
 * Parses amounts, units, and ingredient names, returning byte offsets for
 * ingredient references in the text.
 */

export interface ExtractedIngredient {
  name: string
  amount?: number
  unit?: string
  byteStart: number
  byteEnd: number
}

/**
 * Common unit patterns for ingredient extraction
 * Supports metric and imperial units
 */
const UNIT_PATTERNS = [
  // Metric weight
  { pattern: /\b(kg|kilogram|kilograms)\b/i, name: 'kg' },
  { pattern: /\b(g|gram|grams)\b/i, name: 'g' },
  { pattern: /\b(mg|milligram|milligrams)\b/i, name: 'mg' },
  
  // Metric volume
  { pattern: /\b(l|liter|liters|litre|litres)\b/i, name: 'l' },
  { pattern: /\b(ml|milliliter|milliliters|millilitre|millilitres)\b/i, name: 'ml' },
  
  // Imperial weight
  { pattern: /\b(lb|pound|pounds)\b/i, name: 'lb' },
  { pattern: /\b(oz|ounce|ounces)\b/i, name: 'oz' },
  
  // Imperial volume
  { pattern: /\b(cup|cups)\b/i, name: 'cup' },
  { pattern: /\b(tbsp|tablespoon|tablespoons|T|Tbsp)\b/i, name: 'tbsp' },
  { pattern: /\b(tsp|teaspoon|teaspoons|t)\b/i, name: 'tsp' },
  { pattern: /\b(fl\s*oz|fluid\s*ounce|fluid\s*ounces)\b/i, name: 'fl oz' },
  { pattern: /\b(pt|pint|pints)\b/i, name: 'pt' },
  { pattern: /\b(qt|quart|quarts)\b/i, name: 'qt' },
  { pattern: /\b(gal|gallon|gallons)\b/i, name: 'gal' },
  
  // Common cooking units
  { pattern: /\b(pinch|pinches)\b/i, name: 'pinch' },
  { pattern: /\b(dash|dashes)\b/i, name: 'dash' },
  { pattern: /\b(sprig|sprigs)\b/i, name: 'sprig' },
  { pattern: /\b(clove|cloves)\b/i, name: 'clove' },
  { pattern: /\b(head|heads)\b/i, name: 'head' },
  { pattern: /\b(bunch|bunches)\b/i, name: 'bunch' },
]

/**
 * Converts a fraction string to a decimal number
 * Examples: "1/2" -> 0.5, "3/4" -> 0.75, "1 1/2" -> 1.5
 */
function parseFraction(fractionStr: string): number {
  // Handle mixed numbers like "1 1/2"
  const mixedMatch = fractionStr.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10)
    const numerator = parseInt(mixedMatch[2], 10)
    const denominator = parseInt(mixedMatch[3], 10)
    
    if (denominator === 0) {
      throw new Error(`Invalid fraction format: denominator cannot be zero in "${fractionStr}"`)
    }
    
    const result = whole + (numerator / denominator)
    if (isNaN(result) || !isFinite(result)) {
      throw new Error(`Invalid fraction format: "${fractionStr}"`)
    }
    return result
  }
  
  // Handle simple fractions like "1/2"
  const simpleMatch = fractionStr.match(/^(\d+)\/(\d+)$/)
  if (simpleMatch) {
    const numerator = parseInt(simpleMatch[1], 10)
    const denominator = parseInt(simpleMatch[2], 10)
    
    if (denominator === 0) {
      throw new Error(`Invalid fraction format: denominator cannot be zero in "${fractionStr}"`)
    }
    
    const result = numerator / denominator
    if (isNaN(result) || !isFinite(result)) {
      throw new Error(`Invalid fraction format: "${fractionStr}"`)
    }
    return result
  }
  
  const result = parseFloat(fractionStr)
  if (isNaN(result) || !isFinite(result)) {
    throw new Error(`Invalid fraction format: "${fractionStr}"`)
  }
  return result
}

/**
 * Helper function to calculate byte offset for a character index
 * Uses a cached encoder for better performance with repeated calls
 */
let cachedEncoder: TextEncoder | null = null
function getByteOffset(text: string, charIndex: number): number {
  if (!cachedEncoder) {
    cachedEncoder = new TextEncoder()
  }
  return cachedEncoder.encode(text.slice(0, charIndex)).length
}

/**
 * Action verbs that should not be extracted as ingredient names
 */
const ACTION_VERBS = new Set([
  'add', 'mix', 'stir', 'season', 'sprinkle', 'drizzle', 'garnish',
  'top', 'use', 'include', 'combine', 'whisk', 'beat', 'fold',
  'pour', 'drain', 'chop', 'slice', 'dice', 'mince', 'grate',
  'peel', 'cut', 'trim', 'remove', 'discard'
])

/**
 * Finds the next ingredient pattern starting from a given index
 */
function findNextIngredient(
  text: string,
  startIndex: number
): { amount?: number; unit?: string; name: string; startChar: number; endChar: number } | null {
  // Pattern to match: number (optional) + unit (optional) + ingredient name
  // Amount pattern: whole numbers, decimals, fractions, mixed numbers
  // Order matters: match mixed numbers and fractions before simple numbers
  const amountPattern = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/
  const amountMatch = text.slice(startIndex).match(amountPattern)
  
  if (!amountMatch) {
    return null
  }
  
  const amountStart = startIndex + amountMatch.index!
  const amountEnd = amountStart + amountMatch[1].length
  
  // Parse the amount, handling invalid fraction formats gracefully
  let amount: number
  try {
    amount = parseFraction(amountMatch[1])
  } catch (error) {
    // Skip invalid fraction formats
    return null
  }
  
  // Look for unit after amount (skip whitespace)
  const afterAmountText = text.slice(amountEnd)
  const whitespaceMatch = afterAmountText.match(/^\s+/)
  const whitespaceLength = whitespaceMatch ? whitespaceMatch[0].length : 0
  const afterAmount = afterAmountText.slice(whitespaceLength)
  
  let unit: string | undefined
  let unitEnd = amountEnd + whitespaceLength
  let nameStart = unitEnd
  
  // Try to match each unit pattern
  for (const unitDef of UNIT_PATTERNS) {
    const unitMatch = afterAmount.match(unitDef.pattern)
    if (unitMatch && unitMatch.index === 0) {
      unit = unitDef.name
      unitEnd = amountEnd + whitespaceLength + unitMatch[0].length
      nameStart = unitEnd
      break
    }
  }
  
  // Extract ingredient name after amount/unit
  const afterUnitText = text.slice(nameStart)
  const afterUnitWhitespace = afterUnitText.match(/^\s+/)
  const afterUnitWhitespaceLength = afterUnitWhitespace ? afterUnitWhitespace[0].length : 0
  const afterUnit = afterUnitText.slice(afterUnitWhitespaceLength)
  
  // Skip connector words (handle "of the" as a special case)
  let nameOffset = 0
  const ofTheMatch = afterUnit.match(/^of\s+the\s+/i)
  if (ofTheMatch) {
    nameOffset = ofTheMatch[0].length
  } else {
    const connectorMatch = afterUnit.match(/^(of|the|a|an)\s+/i)
    if (connectorMatch) {
      nameOffset = connectorMatch[0].length
    }
  }
  const nameText = afterUnit.slice(nameOffset).trim()
  
  if (!nameText || nameText.length === 0) {
    return null
  }
  
  // Find where name ends (at comma, "and", "or", next number followed by space/unit, or end)
  // Use lookahead to avoid stopping at numbers that are part of the ingredient name
  // (e.g., "2% milk" or "80/20 ground beef")
  const nameEndMatch = nameText.match(/\s*(?:,|\band\b|\bor\b|(?=\d+\s*(?:g|kg|ml|l|cup|tbsp|tsp|oz|lb|%|$))|$)/i)
  const nameLength = nameEndMatch ? nameEndMatch.index! : nameText.length
  const name = nameText.slice(0, nameLength).trim()
  
  if (!name || name.length === 0 || ACTION_VERBS.has(name.toLowerCase())) {
    return null
  }
  
  const nameStartChar = nameStart + afterUnitWhitespaceLength + nameOffset
  const nameEndChar = nameStartChar + name.length
  
  return {
    amount,
    unit,
    name,
    startChar: amountStart,
    endChar: nameEndChar,
  }
}

/**
 * Options for ingredient extraction
 */
export interface ExtractIngredientsOptions {
  /**
   * Threshold for duplicate detection in bytes.
   * Ingredients with the same name, amount, and unit within this distance are considered duplicates.
   * Default: 10 bytes
   */
  duplicateThreshold?: number
}

/**
 * Main function to extract ingredients from natural language step text
 * 
 * @param stepText - The natural language text of a recipe step
 * @param options - Optional configuration for extraction behavior
 * @returns Array of extracted ingredients with amounts, units, names, and byte offsets
 * 
 * @example
 * extractIngredients("mix 240g flour and 60g sugar")
 * // Returns:
 * // [
 * //   { name: 'flour', amount: 240, unit: 'g', byteStart: 5, byteEnd: 13 },
 * //   { name: 'sugar', amount: 60, unit: 'g', byteStart: 18, byteEnd: 24 }
 * // ]
 */
export function extractIngredients(
  stepText: string,
  options: ExtractIngredientsOptions = {}
): ExtractedIngredient[] {
  const { duplicateThreshold = 10 } = options
  if (!stepText || stepText.trim().length === 0) {
    return []
  }
  
  const ingredients: ExtractedIngredient[] = []
  let searchIndex = 0
  
  // Find all ingredient patterns in the text
  while (searchIndex < stepText.length) {
    const ingredient = findNextIngredient(stepText, searchIndex)
    
    if (!ingredient) {
      searchIndex++
      continue
    }
    
    // Calculate byte offsets
    const byteStart = getByteOffset(stepText, ingredient.startChar)
    const byteEnd = getByteOffset(stepText, ingredient.endChar)
    
    // Check for duplicates (same name, amount, unit, and close position)
    const isDuplicate = ingredients.some(
      ing => ing.name.toLowerCase() === ingredient.name.toLowerCase() &&
             ing.amount === ingredient.amount &&
             ing.unit === ingredient.unit &&
             Math.abs(ing.byteStart - byteStart) < duplicateThreshold
    )
    
    if (!isDuplicate) {
      ingredients.push({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        byteStart,
        byteEnd,
      })
    }
    
    // Move search index past this ingredient (but not too far to miss adjacent ingredients)
    searchIndex = ingredient.endChar
  }
  
  // If no ingredients found with amounts, try to find ingredients without amounts
  if (ingredients.length === 0) {
    // Look for action verb + ingredient name patterns
    // Use matchAll for better performance and clarity
    const actionVerbPattern = /\b(add|mix|stir|season|sprinkle|drizzle|garnish|top|use|include|combine)\s+([^,]+?)(?=\s*(?:,|\band\b|\bor\b|\d|$))/gi
    const matches = Array.from(stepText.matchAll(actionVerbPattern))
    
    for (const actionMatch of matches) {
      const name = actionMatch[2].trim()
      // Skip if it's an action verb or common word
      if (name.length > 0 && name.length < 50 && !ACTION_VERBS.has(name.toLowerCase())) {
        const matchStart = actionMatch.index! + actionMatch[1].length + 1
        const matchEnd = actionMatch.index! + actionMatch[0].length
        
        const byteStart = getByteOffset(stepText, matchStart)
        const byteEnd = getByteOffset(stepText, matchEnd)
        
        ingredients.push({
          name,
          byteStart,
          byteEnd,
        })
      }
    }
  }
  
  return ingredients
}
