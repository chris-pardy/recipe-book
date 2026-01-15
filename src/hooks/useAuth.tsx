/**
 * Hook to access auth context
 * Must be used within an AuthProvider
 */

import { useContext } from 'react'
import type { AuthContextValue } from '../types/auth'
import { AuthContext } from './AuthContext'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}
