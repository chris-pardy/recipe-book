import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './hooks/AuthProvider'
import { initDB } from './services/indexeddb'

// Initialize IndexedDB on app start
// Note: Silent failure is acceptable here as the app can still function
// without IndexedDB (though with reduced offline capabilities).
// In production, you might want to show a user-facing error or retry.
initDB().catch((error) => {
  console.error('Failed to initialize IndexedDB:', error)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
