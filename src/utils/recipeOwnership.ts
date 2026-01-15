/**
 * Utility functions for determining recipe ownership
 */

/**
 * Parse the DID (Decentralized Identifier) from an ATProto URI
 * @param uri - ATProto URI in format: at://did:plc:xxx/collection/rkey
 * @returns The DID from the URI, or null if invalid
 */
export function getDidFromUri(uri: string): string | null {
  try {
    // ATProto URIs must start with "at://"
    if (!uri.startsWith('at://')) {
      if (uri && typeof uri === 'string') {
        console.warn(`Invalid ATProto URI format (must start with "at://"): ${uri}`)
      }
      return null
    }
    // ATProto URIs are in format: at://did:plc:xxx/collection/rkey
    const uriParts = uri.replace('at://', '').split('/')
    if (uriParts.length < 1) {
      console.warn(`Invalid ATProto URI format (no path parts): ${uri}`)
      return null
    }
    const did = uriParts[0]
    // Validate that it looks like a DID (starts with "did:")
    if (!did.startsWith('did:')) {
      console.warn(`Invalid ATProto URI format (DID must start with "did:"): ${uri}`)
      return null
    }
    return did
  } catch (error) {
    console.warn(`Error parsing ATProto URI: ${uri}`, error)
    return null
  }
}

/**
 * Check if a recipe is owned by the current user
 * @param recipeUri - The URI of the recipe
 * @param userDid - The DID of the current user
 * @returns true if the recipe is owned by the user, false otherwise
 */
export function isRecipeOwned(recipeUri: string, userDid: string | null): boolean {
  if (!userDid) {
    return false
  }
  const recipeDid = getDidFromUri(recipeUri)
  return recipeDid === userDid
}
