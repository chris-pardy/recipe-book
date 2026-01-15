/**
 * 404 Not Found page component
 * Handles unknown routes
 */

import { Link } from 'react-router-dom'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'

export function NotFound() {
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardContent className="p-6 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
          <p className="text-xl text-gray-600 mb-6">
            Page not found
          </p>
          <p className="text-gray-500 mb-6">
            The page you're looking for doesn't exist.
          </p>
          <Link to="/">
            <Button>Go to Home</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
