import { ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'

/**
 * Custom render function that wraps components with any providers
 * This can be extended to include context providers, routers, etc.
 */
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { ...options })

// Re-export everything from React Testing Library
export * from '@testing-library/react'
export { customRender as render }
