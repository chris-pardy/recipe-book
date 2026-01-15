/**
 * Login component for Bluesky OAuth authentication
 */

import { useState, FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

export interface LoginProps {
  className?: string
}

/**
 * Validates a Bluesky handle format
 * Handles must contain at least one dot (e.g., username.bsky.social)
 * @param handle - The handle to validate
 * @returns True if the handle appears to be in a valid format
 */
function isValidHandle(handle: string): boolean {
  const trimmed = handle.trim()
  if (!trimmed) return false
  // Basic validation: must contain at least one dot
  return trimmed.includes('.')
}

export function Login({ className }: LoginProps) {
  const { login, isLoading, error } = useAuth()
  const [handle, setHandle] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedHandle = handle.trim()
    
    if (!trimmedHandle) {
      setHandleError('Please enter your Bluesky handle')
      return
    }
    
    if (!isValidHandle(trimmedHandle)) {
      setHandleError('Handle must be in the format username.bsky.social')
      return
    }
    
    setHandleError(null)
    await login(trimmedHandle)
  }
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setHandle(value)
    // Clear error when user starts typing
    if (handleError && value.trim()) {
      setHandleError(null)
    }
  }

  return (
    <div className={cn('flex flex-col items-center justify-center p-8', className)}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Recipe Book</h1>
          <p className="mt-2 text-gray-600">
            Sign in with your Bluesky account to manage your recipes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="handle" 
              className="block text-sm font-medium text-gray-700"
            >
              Bluesky Handle
            </label>
            <input
              id="handle"
              type="text"
              value={handle}
              onChange={handleChange}
              placeholder="your-handle.bsky.social"
              className={cn(
                "mt-1 block w-full rounded-md border px-3 py-2 shadow-sm focus:outline-none focus:ring-1",
                handleError
                  ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              )}
              disabled={isLoading}
              required
              aria-invalid={handleError ? 'true' : 'false'}
              aria-describedby={handleError ? 'handle-error' : undefined}
            />
            {handleError ? (
              <p id="handle-error" className="mt-1 text-xs text-red-600" role="alert">
                {handleError}
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Enter your full handle (e.g., username.bsky.social)
              </p>
            )}
          </div>

          {error && (
            <div 
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !handle.trim() || !!handleError}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-busy={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in with Bluesky'}
          </button>
        </form>
      </div>
    </div>
  )
}
