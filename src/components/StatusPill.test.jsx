import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill.jsx'

describe('StatusPill', () => {
  it('renders the status text by default', () => {
    render(<StatusPill status="approved" />)
    expect(screen.getByText('approved')).toBeInTheDocument()
  })

  it('renders custom children over the raw status', () => {
    render(<StatusPill status="approved">Approved</StatusPill>)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('falls back to the pending style for an unknown status', () => {
    render(<StatusPill status="some_unknown_status" />)
    const pill = screen.getByText('some_unknown_status')
    expect(pill.className).toContain('bg-warning-soft')
  })

  it('is case-insensitive when matching known statuses', () => {
    render(<StatusPill status="APPROVED" />)
    const pill = screen.getByText('APPROVED')
    expect(pill.className).toContain('bg-success-soft')
  })
})
