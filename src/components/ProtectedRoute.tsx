/**
 * Protected route wrapper component
 * Redirects to login if user is not authenticated
 */

import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Login } from './Login'

export interface ProtectedRouteProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Wrapper component that requires authentication
 * Shows login component if not authenticated
 * Shows loading state during auth initialization
 * Redirects to login route if not authenticated (when using React Router)
 */
export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading state during initialization
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>
    }
    return <Navigate to="/login" replace />
  }

  // Render children if authenticated
  return <>{children}</>
}
