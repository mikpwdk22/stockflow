import { describe, expect, it } from 'vitest'
import {
  formatIDR,
  formatRelativeTime,
  validateOrderInput,
} from './formatters'

describe('formatIDR', () => {
  it('formats thousands correctly with dots as required in IDR', () => {
    expect(formatIDR(85000)).toBe('Rp 85.000')
    expect(formatIDR(1234567)).toBe('Rp 1.234.567')
    expect(formatIDR(0)).toBe('Rp 0')
  })

  it('handles negative or invalid values gracefully', () => {
    expect(formatIDR(NaN)).toBe('Rp 0')
  })
})

describe('formatRelativeTime', () => {
  it('returns "-" for null or empty dates', () => {
    expect(formatRelativeTime(null)).toBe('-')
    expect(formatRelativeTime(undefined)).toBe('-')
    expect(formatRelativeTime('')).toBe('-')
  })

  it('formats recent timestamps', () => {
    const justNow = new Date().toISOString()
    expect(formatRelativeTime(justNow)).toBe('Just now')

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago')

    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString()
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago')
  })
})

describe('validateOrderInput', () => {
  it('detects missing customer name', () => {
    const res = validateOrderInput('', [{ sku: 'COF-01', qty: 1 }])
    expect(res.isValid).toBe(false)
    expect(res.errors).toContain('Customer name is required')
  })

  it('detects empty items list', () => {
    const res = validateOrderInput('John Doe', [])
    expect(res.isValid).toBe(false)
    expect(res.errors).toContain('At least one item is required in the order')
  })

  it('detects duplicate SKUs in items', () => {
    const res = validateOrderInput('John Doe', [
      { sku: 'COF-01', qty: 2 },
      { sku: 'COF-01', qty: 3 },
    ])
    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.includes('Duplicate SKU'))).toBe(true)
  })

  it('detects zero or negative quantities', () => {
    const res = validateOrderInput('John Doe', [
      { sku: 'COF-01', qty: 0 },
      { sku: 'COF-02', qty: -5 },
    ])
    expect(res.isValid).toBe(false)
    expect(res.errors.length).toBe(2)
  })

  it('approves valid order input', () => {
    const res = validateOrderInput('John Doe', [
      { sku: 'COF-01', qty: 2 },
      { sku: 'TEA-02', qty: 1 },
    ])
    expect(res.isValid).toBe(true)
    expect(res.errors.length).toBe(0)
  })
})
