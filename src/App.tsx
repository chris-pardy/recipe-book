import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import { Home } from './components/Home'
import { Login } from './components/Login'
import { RecipeCreationForm } from './components/RecipeCreationForm'
import { RecipeView } from './components/RecipeView'
import { NotFound } from './components/NotFound'
import { ProtectedRoute } from './components/ProtectedRoute'
import './App.css'

/**
 * Wrapper component for RecipeView that extracts the recipe URI from URL params
 */
function RecipeViewWrapper() {
  const { id } = useParams<{ id: string }>()
  
  if (!id) {
    return <Navigate to="/" replace />
  }
  
  // Decode the URI from the URL parameter
  let recipeUri: string
  try {
    recipeUri = decodeURIComponent(id)
  } catch {
    // If URI is malformed, redirect to home
    return <Navigate to="/" replace />
  }
  
  return <RecipeView recipeUri={recipeUri} />
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main>
          <Routes>
            {/* Home route - shows collections if any, otherwise all recipes */}
            <Route path="/" element={<Home />} />
            
            {/* Login route */}
            <Route path="/login" element={<Login className="min-h-screen" />} />
            
            {/* Create recipe route - protected */}
            <Route
              path="/create"
              element={
                <ProtectedRoute>
                  <RecipeCreationForm />
                </ProtectedRoute>
              }
            />
            
            {/* Recipe view route - public (accessible via URL) */}
            <Route
              path="/recipe/:id"
              element={<RecipeViewWrapper />}
            />
            
            {/* 404 route - must be last */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
