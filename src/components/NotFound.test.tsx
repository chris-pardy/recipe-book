/**
 * Tests for NotFound component
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFound } from './NotFound'
import { BrowserRouter } from 'react-router-dom'

describe('NotFound Component', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>{children}</BrowserRouter>
  )

  it('should render 404 message', () => {
    render(<NotFound />, { wrapper })

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByText(/page not found/i)).toBeInTheDocument()
  })

  it('should have link to home page', () => {
    render(<NotFound />, { wrapper })

    const homeLink = screen.getByRole('link', { name: /go to home/i })
    expect(homeLink).toHaveAttribute('href', '/')
  })
})
