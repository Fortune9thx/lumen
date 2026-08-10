import { describe, it, expect } from 'vitest'
import { parseAmount, isValidAmount, isValidWholeGenAmount, isValidUrl, validate } from './validation.js'

describe('parseAmount', () => {
  it('strips currency symbols and commas', () => {
    expect(parseAmount('$500.00')).toBe(500)
    expect(parseAmount('2,000')).toBe(2000)
  })
  it('returns null for empty or non-numeric input', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('isValidAmount', () => {
  it('accepts positive amounts', () => {
    expect(isValidAmount('35')).toBe(true)
    expect(isValidAmount('$500.00')).toBe(true)
  })
  it('rejects zero, negative, or empty', () => {
    expect(isValidAmount('0')).toBe(false)
    expect(isValidAmount('')).toBe(false)
    expect(isValidAmount('-5')).toBe(false)
  })
})

describe('isValidWholeGenAmount', () => {
  it('accepts whole positive integers', () => {
    expect(isValidWholeGenAmount('500')).toBe(true)
    expect(isValidWholeGenAmount('1')).toBe(true)
  })
  it('rejects decimals, since GenVM calldata has no float type', () => {
    expect(isValidWholeGenAmount('35.5')).toBe(false)
  })
  it('rejects zero, negative, empty, and non-numeric', () => {
    expect(isValidWholeGenAmount('0')).toBe(false)
    expect(isValidWholeGenAmount('-5')).toBe(false)
    expect(isValidWholeGenAmount('')).toBe(false)
    expect(isValidWholeGenAmount('abc')).toBe(false)
  })
})

describe('isValidUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isValidUrl('https://flightaware.com/live/flight/BA287')).toBe(true)
    expect(isValidUrl('http://example.com')).toBe(true)
  })
  it('rejects non-http(s) protocols and malformed input', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false)
    expect(isValidUrl('not a url')).toBe(false)
    expect(isValidUrl('')).toBe(false)
  })
})

describe('validate', () => {
  it('collects one error per failing check', () => {
    const errors = validate(
      { name: '', age: '15' },
      [
        ['name', (v) => Boolean(v), 'Name is required'],
        ['age', (v) => Number(v) >= 18, 'Must be 18+'],
      ],
    )
    expect(errors).toEqual({ name: 'Name is required', age: 'Must be 18+' })
  })
  it('returns an empty object when everything passes', () => {
    const errors = validate(
      { name: 'Ada' },
      [['name', (v) => Boolean(v), 'Name is required']],
    )
    expect(errors).toEqual({})
  })
})
