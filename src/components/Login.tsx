/**
 * Login component for Bluesky OAuth authentication
 */

import { useState, FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

export interface LoginProps {
  className?: string
}

export function Login({ className }: LoginProps) {
  const { login, isLoading, error } = useAuth()
  const [handle, setHandle] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!handle.trim()) return
    await login(handle.trim())
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
              onChange={(e) => setHandle(e.target.value)}
              placeholder="your-handle.bsky.social"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isLoading}
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter your full handle (e.g., username.bsky.social)
            </p>
          </div>

          {error && (
            <div 
              className="rounded-md bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !handle.trim()}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Signing in...' : 'Sign in with Bluesky'}
          </button>
        </form>
      </div>
    </div>
  )
}
