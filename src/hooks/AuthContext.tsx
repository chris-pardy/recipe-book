/**
 * Authentication context for managing Bluesky OAuth state
 */

import { createContext } from 'react'
import type { AuthContextValue } from '../types/auth'

export const AuthContext = createContext<AuthContextValue | null>(null)
