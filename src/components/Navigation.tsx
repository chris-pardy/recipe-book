/**
 * Navigation component for the application
 * Displays navigation header with login/logout based on auth state
 */

import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { UserMenu } from './UserMenu'
import { Button } from './ui/button'

export function Navigation() {
  const { isAuthenticated } = useAuth()

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors"
            >
              Recipe Book
            </Link>
            {isAuthenticated && (
              <div className="flex items-center gap-4">
                <Link
                  to="/"
                  className="text-gray-700 hover:text-blue-600 transition-colors"
                >
                  Home
                </Link>
                <Link
                  to="/create"
                  className="text-gray-700 hover:text-blue-600 transition-colors"
                >
                  Create Recipe
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <Link to="/login">
                <Button variant="outline">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
