/**
 * Ingredient Extraction Utility
 * 
 * Extracts structured ingredient data from natural language recipe step text.
 * Parses amounts, units, and ingredient names, returning byte offsets for
 * ingredient references in the text.
 * 
 * Enhanced with:
 * - Ingredient synonym recognition and normalization
 * - Cook time extraction from step text
 * - Improved parsing accuracy for fractions and abbreviations
 */

export interface ExtractedIngredient {
  name: string
  amount?: number
  unit?: string
  byteStart: number
  byteEnd: number
}

export interface ExtractedCookTime {
  duration: number // in minutes
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
 * Ingredient synonym dictionary
 * Maps variations and synonyms to canonical ingredient names
 * This helps normalize ingredient names for better matching
 */
const INGREDIENT_SYNONYMS: Record<string, string> = {
  // Flour variations
  'all-purpose flour': 'flour',
  'all purpose flour': 'flour',
  'ap flour': 'flour',
  'plain flour': 'flour',
  'white flour': 'flour',
  'all-purpose': 'flour',
  
  // Sugar variations
  'white sugar': 'sugar',
  'granulated sugar': 'sugar',
  'caster sugar': 'sugar',
  'superfine sugar': 'sugar',
  'brown sugar': 'brown sugar', // Keep as distinct
  'light brown sugar': 'brown sugar',
  'dark brown sugar': 'brown sugar',
  'demerara sugar': 'brown sugar',
  
  // Butter variations
  'unsalted butter': 'butter',
  'salted butter': 'butter',
  'sweet butter': 'butter',
  
  // Milk variations
  'whole milk': 'milk',
  'full-fat milk': 'milk',
  'full fat milk': 'milk',
  'skim milk': 'milk',
  'skimmed milk': 'milk',
  'low-fat milk': 'milk',
  'low fat milk': 'milk',
  
  // Oil variations
  'vegetable oil': 'oil',
  'cooking oil': 'oil',
  'canola oil': 'oil',
  'rapeseed oil': 'oil',
  'sunflower oil': 'oil',
  'olive oil': 'olive oil', // Keep as distinct
  
  // Salt variations
  'table salt': 'salt',
  'kosher salt': 'salt',
  'sea salt': 'salt',
  'iodized salt': 'salt',
  
  // Egg variations
  'chicken eggs': 'eggs',
  'large eggs': 'eggs',
  'medium eggs': 'eggs',
  'small eggs': 'eggs',
  
  // Onion variations
  'yellow onion': 'onion',
  'white onion': 'onion',
  'brown onion': 'onion',
  'sweet onion': 'onion',
  'red onion': 'red onion', // Keep as distinct
  
  // Garlic variations
  'garlic cloves': 'garlic',
  'garlic clove': 'garlic',
  
  // Pepper variations
  'black pepper': 'pepper',
  'ground pepper': 'pepper',
  'white pepper': 'pepper',
  'cayenne pepper': 'cayenne pepper', // Keep as distinct
  'red pepper': 'red pepper', // Keep as distinct
  
  // Cheese variations
  'cheddar cheese': 'cheese',
  'mozzarella cheese': 'cheese',
  'parmesan cheese': 'parmesan', // Keep as distinct
  'parmigiano reggiano': 'parmesan',
  
  // Tomato variations
  'tomatoes': 'tomato',
  'fresh tomatoes': 'tomato',
  'canned tomatoes': 'tomato',
  'tomato paste': 'tomato paste', // Keep as distinct
  'tomato sauce': 'tomato sauce', // Keep as distinct
}

/**
 * Normalizes an ingredient name using the synonym dictionary
 * Returns the canonical name if a synonym is found, otherwise returns the original name
 */
function normalizeIngredientName(name: string): string {
  const normalized = name.toLowerCase().trim()
  return INGREDIENT_SYNONYMS[normalized] || name
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
 * Default threshold for duplicate detection in bytes
 */
const DEFAULT_DUPLICATE_THRESHOLD = 10

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
  const { duplicateThreshold = DEFAULT_DUPLICATE_THRESHOLD } = options
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
      // Normalize ingredient name using synonym dictionary
      const normalizedName = normalizeIngredientName(ingredient.name)
      
      ingredients.push({
        name: normalizedName,
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
        
        // Normalize ingredient name using synonym dictionary
        const normalizedName = normalizeIngredientName(name)
        
        ingredients.push({
          name: normalizedName,
          byteStart,
          byteEnd,
        })
      }
    }
  }
  
  return ingredients
}

/**
 * Time patterns for cook time extraction
 * Matches various time expressions like "1 hour", "30 minutes", "45 min", etc.
 */
const TIME_PATTERNS = [
  // Hours and minutes combined: "1 hour and 30 minutes", "1h 30m", "1:30"
  {
    pattern: /(\d+)\s*(?:hour|hours|hr|hrs|h)\s*(?:and|\+)?\s*(\d+)\s*(?:minute|minutes|min|mins|m)\b/gi,
    extract: (match: RegExpMatchArray): number => {
      const hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      return hours * 60 + minutes
    }
  },
  // Hours and minutes in format "1:30", "1h30m", "1hr30min"
  {
    pattern: /(\d+)\s*[:h]\s*(\d+)\s*(?:m|min|minute|minutes)?\b/gi,
    extract: (match: RegExpMatchArray): number => {
      const hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      return hours * 60 + minutes
    }
  },
  // Hours only: "1 hour", "2 hours", "1h", "2hrs"
  {
    pattern: /(\d+)\s*(?:hour|hours|hr|hrs|h)\b/gi,
    extract: (match: RegExpMatchArray): number => {
      const hours = parseInt(match[1], 10)
      return hours * 60
    }
  },
  // Minutes only: "30 minutes", "45 min", "30m"
  {
    pattern: /(\d+)\s*(?:minute|minutes|min|mins|m)\b/gi,
    extract: (match: RegExpMatchArray): number => {
      return parseInt(match[1], 10)
    }
  },
]

/**
 * Extracts cook time from recipe step text
 * 
 * @param stepText - The natural language text of a recipe step
 * @returns Array of extracted cook times with duration (in minutes) and byte offsets
 * 
 * @example
 * extractCookTime("Cook the mixture for 1 hour and 30 minutes until golden")
 * // Returns:
 * // [
 * //   { duration: 90, byteStart: 20, byteEnd: 40 }
 * // ]
 */
export function extractCookTime(stepText: string): ExtractedCookTime[] {
  if (!stepText || stepText.trim().length === 0) {
    return []
  }
  
  const cookTimes: ExtractedCookTime[] = []
  
  // Try each time pattern (order matters - more specific patterns first)
  for (const timeDef of TIME_PATTERNS) {
    const matches = Array.from(stepText.matchAll(timeDef.pattern))
    
    for (const match of matches) {
      try {
        const duration = timeDef.extract(match)
        
        if (duration > 0 && isFinite(duration)) {
          const matchStart = match.index!
          const matchEnd = matchStart + match[0].length
          
          const byteStart = getByteOffset(stepText, matchStart)
          const byteEnd = getByteOffset(stepText, matchEnd)
          
          // Check for overlapping or contained matches
          // A match is a duplicate if:
          // 1. It overlaps with an existing match (ranges intersect)
          // 2. It's completely contained within an existing match
          // 3. An existing match is completely contained within it (keep the longer one)
          let itemsToRemove: number[] = []
          const isOverlapping = cookTimes.some((ct, index) => {
            const rangesOverlap = !(byteEnd <= ct.byteStart || byteStart >= ct.byteEnd)
            
            if (rangesOverlap) {
              // If ranges overlap, prefer the longer match (more specific)
              const thisLength = byteEnd - byteStart
              const otherLength = ct.byteEnd - ct.byteStart
              
              // If this match is longer, mark the shorter one for removal
              if (thisLength > otherLength) {
                itemsToRemove.push(index)
                return false // Not a duplicate, we'll add this one
              }
              
              // If the other match is longer or equal, this is a duplicate
              return true
            }
            
            return false
          })
          
          // Remove items in reverse order to maintain indices
          itemsToRemove.reverse().forEach(index => cookTimes.splice(index, 1))
          
          if (!isOverlapping) {
            cookTimes.push({
              duration,
              byteStart,
              byteEnd,
            })
          }
        }
      } catch (error) {
        // Skip invalid matches (e.g., malformed time patterns, invalid regex matches)
        // This allows the extraction to continue processing other valid matches
        // rather than failing entirely on a single invalid match
        continue
      }
    }
  }
  
  // Sort by position in text (earliest first)
  return cookTimes.sort((a, b) => a.byteStart - b.byteStart)
}
