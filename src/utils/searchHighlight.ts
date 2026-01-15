/**
 * Utility functions for highlighting search terms in text
 */

/**
 * Highlight search terms in a text string
 * Returns an array of text segments with highlighted portions marked
 */
export interface HighlightSegment {
  text: string
  highlighted: boolean
}

export function highlightText(
  text: string,
  searchTerms: string[],
): HighlightSegment[] {
  if (searchTerms.length === 0 || !text) {
    return [{ text, highlighted: false }]
  }

  // Create a regex pattern that matches any of the search terms (case-insensitive)
  const escapedTerms = searchTerms
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .map((term) => escapeRegex(term))
  
  if (escapedTerms.length === 0) {
    return [{ text, highlighted: false }]
  }

  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi')
  const segments: HighlightSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex lastIndex to ensure we start from the beginning
  pattern.lastIndex = 0

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, match.index),
        highlighted: false,
      })
    }

    // Add the matched text as highlighted
    segments.push({
      text: match[0],
      highlighted: true,
    })

    lastIndex = pattern.lastIndex

    // Prevent infinite loop if regex matches empty string
    if (match[0].length === 0) {
      pattern.lastIndex++
    }
  }

  // Add remaining text after the last match
  if (lastIndex < text.length) {
    segments.push({
      text: text.substring(lastIndex),
      highlighted: false,
    })
  }

  // If no matches found, return the original text
  if (segments.length === 0) {
    return [{ text, highlighted: false }]
  }

  return segments
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract search terms from a query string
 * Splits by spaces and filters out empty strings
 */
export function extractSearchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .map((term) => term.toLowerCase())
}
