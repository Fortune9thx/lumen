import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

describe('App', () => {
  it('renders the landing page at / without crashing', () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(screen.getByText(/Insurance written/i)).toBeInTheDocument()
  })

  it('renders the Dashboard route without crashing when no wallet is connected', () => {
    window.history.pushState({}, '', '/dashboard')
    render(<App />)
    expect(screen.getByText('Welcome to Lumen')).toBeInTheDocument()
    // "Connect Wallet" legitimately appears twice: the nav bar button and Dashboard's own CTA.
    expect(screen.getAllByText('Connect Wallet').length).toBeGreaterThan(0)
  })

  it('renders the Create Flight Policy form without crashing', () => {
    window.history.pushState({}, '', '/policies/new/flight')
    render(<App />)
    expect(screen.getByText('New Flight Policy')).toBeInTheDocument()
  })
})
