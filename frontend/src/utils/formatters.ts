// Pure utility functions and formatters

export function formatIDR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return 'Rp 0'
  }
  // Standard Indonesian Rupiah dot-separated thousands: Rp 1.234.567
  const parts = Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `Rp ${parts}`
}

export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return '-'

  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '-'

  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 0) return 'Just now'
  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days}d ago`
  }

  // Fallback to localized date: 28 Oct 2026
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export interface OrderItemValidation {
  sku: string
  qty: number
}

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function validateOrderInput(
  customer: string,
  items: OrderItemValidation[]
): ValidationResult {
  const errors: string[] = []

  if (!customer || customer.trim().length === 0) {
    errors.push('Customer name is required')
  }

  if (!items || items.length === 0) {
    errors.push('At least one item is required in the order')
    return { isValid: false, errors }
  }

  const seenSKUs = new Set<string>()
  items.forEach((item, index) => {
    const lineNum = index + 1
    if (!item.sku || item.sku.trim() === '') {
      errors.push(`Item #${lineNum}: SKU is required`)
    } else {
      const trimmed = item.sku.trim()
      if (seenSKUs.has(trimmed)) {
        errors.push(`Duplicate SKU "${trimmed}" in order. Please adjust quantity on the existing row.`)
      }
      seenSKUs.add(trimmed)
    }

    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      errors.push(`Item #${lineNum}: Quantity must be an integer greater than 0`)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}
