import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from './test/utils'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  })

  it('renders the app with initial content', () => {
    render(<App />)
    
    expect(screen.getByText(/vite \+ react/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /count is/i })).toBeInTheDocument()
  })

  it('increments count when button is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)
    
    const button = screen.getByRole('button', { name: /count is/i })
    expect(button).toHaveTextContent('count is 0')
    
    await user.click(button)
    expect(button).toHaveTextContent('count is 1')
    
    await user.click(button)
    expect(button).toHaveTextContent('count is 2')
  })

  it('displays Vite and React logos', () => {
    render(<App />)
    
    const viteLogo = screen.getByAltText('Vite logo')
    const reactLogo = screen.getByAltText('React logo')
    
    expect(viteLogo).toBeInTheDocument()
    expect(reactLogo).toBeInTheDocument()
  })
})
