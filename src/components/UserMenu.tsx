/**
 * User menu component showing logged in user and logout option
 */

import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

export interface UserMenuProps {
  className?: string
}

export function UserMenu({ className }: UserMenuProps) {
  const { session, logout, isLoading } = useAuth()

  if (!session) {
    return null
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className="text-sm text-gray-700">
        @{session.handle}
      </span>
      <button
        onClick={logout}
        disabled={isLoading}
        className="rounded-md px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
      >
        {isLoading ? 'Signing out...' : 'Sign out'}
      </button>
    </div>
  )
}
