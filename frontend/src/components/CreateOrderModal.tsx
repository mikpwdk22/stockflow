import React, { useState } from 'react'
import { api } from '../api/client'
import { ApiError } from '../types/api'
import type { Product, SalesOrder } from '../types/api'
import { formatIDR } from '../utils/formatters'

interface CreateOrderModalProps {
  products: Product[]
  isOpen: boolean
  onClose: () => void
  onSuccess: (order: SalesOrder) => void
}

interface OrderItemForm {
  sku: string
  qty: number | ''
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  products,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [customer, setCustomer] = useState('')
  const [items, setItems] = useState<OrderItemForm[]>([{ sku: '', qty: 1 }])
  const [saving, setSaving] = useState(false)

  // Validation / Error states
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [failedSKU, setFailedSKU] = useState<{
    sku: string
    available: number
  } | null>(null)
  const [createdOrder, setCreatedOrder] = useState<SalesOrder | null>(null)

  if (!isOpen) return null

  const activeProducts = products.filter((p) => p.is_active)

  const handleAddItem = () => {
    setItems((prev) => [...prev, { sku: '', qty: 1 }])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (
    index: number,
    field: 'sku' | 'qty',
    value: string | number
  ) => {
    setFailedSKU(null)
    setValidationErrors([])
    setItems((prev) => {
      const updated = [...prev]
      if (field === 'sku') {
        updated[index] = { ...updated[index], sku: String(value) }
      } else {
        updated[index] = {
          ...updated[index],
          qty: value === '' ? '' : Math.max(1, Math.floor(Number(value))),
        }
      }
      return updated
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationErrors([])
    setFailedSKU(null)

    // Client-side quick check
    const errors: string[] = []
    if (!customer.trim()) {
      errors.push('Customer name is required')
    }
    if (items.length === 0) {
      errors.push('At least one item is required')
    }

    const seenSKUs = new Set<string>()
    items.forEach((item, idx) => {
      if (!item.sku) {
        errors.push(`Item #${idx + 1}: Please select a product SKU`)
      } else {
        if (seenSKUs.has(item.sku)) {
          errors.push(
            `Duplicate SKU "${item.sku}" detected. Combine quantity into a single line.`
          )
        }
        seenSKUs.add(item.sku)
      }

      if (item.qty === '' || item.qty <= 0) {
        errors.push(`Item #${idx + 1}: Quantity must be at least 1`)
      }
    })

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setSaving(true)
    try {
      const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const order = await api.orders.create(
        {
          customer: customer.trim(),
          items: items.map((i) => ({ sku: i.sku, qty: Number(i.qty) })),
        },
        idempotencyKey
      )

      setCreatedOrder(order)
      onSuccess(order)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INSUFFICIENT_STOCK') {
          setFailedSKU({
            sku: err.sku || 'Unknown',
            available: err.available ?? 0,
          })
        } else {
          setValidationErrors([err.message])
        }
      } else if (err instanceof Error) {
        setValidationErrors([err.message])
      } else {
        setValidationErrors(['An unexpected error occurred during order submission'])
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    setCustomer('')
    setItems([{ sku: '', qty: 1 }])
    setValidationErrors([])
    setFailedSKU(null)
    setCreatedOrder(null)
    onClose()
  }

  // 1. Success confirmation screen with server-computed total
  if (createdOrder) {
    return (
      <div className="modal-backdrop">
        <div className="modal-content max-w-lg">
          <div className="modal-header bg-emerald-50 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <div>
                <h3 className="text-base font-bold text-emerald-950">
                  Sales Order #{createdOrder.id} Created Successfully
                </h3>
                <p className="text-xs text-emerald-700">
                  Stock decremented atomically in single database transaction.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex justify-between text-sm py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Customer:</span>
              <span className="font-bold text-slate-900">{createdOrder.customer}</span>
            </div>

            <div className="flex justify-between text-sm py-2 border-b border-slate-100">
              <span className="text-slate-500 font-medium">Status:</span>
              <span className="badge badge-success font-semibold">
                {createdOrder.status}
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Order Items & Server Unit Prices
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 font-semibold border-b border-slate-200 pb-2">
                      <th className="text-left pb-1">SKU</th>
                      <th className="text-center pb-1">Qty</th>
                      <th className="text-right pb-1">Unit Price</th>
                      <th className="text-right pb-1">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {createdOrder.items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-2 font-mono font-medium">{it.sku}</td>
                        <td className="py-2 text-center font-bold">{it.qty}</td>
                        <td className="py-2 text-right text-slate-600">
                          {formatIDR(it.unit_price)}
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900">
                          {formatIDR(it.unit_price * it.qty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-sm font-bold text-slate-700">
                Server-Computed Grand Total:
              </span>
              <span className="text-xl font-bold text-indigo-700 font-mono">
                {formatIDR(createdOrder.total)}
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button onClick={handleClose} className="btn btn-primary">
              Done & Return to Inventory
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Record New Sales Order
              </h3>
              <p className="text-xs text-slate-500">
                Unit prices and grand total are verified & computed by the server.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="btn-close"
              aria-label="Close"
              disabled={saving}
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {failedSKU && (
              <div className="alert alert-error">
                <span className="text-2xl">⛔</span>
                <div>
                  <div className="font-bold text-rose-900">
                    Order Rejected: Insufficient Stock (409)
                  </div>
                  <div className="text-xs text-rose-700 mt-1">
                    Item <span className="font-mono font-bold bg-rose-100 px-1 py-0.5 rounded">{failedSKU.sku}</span> only has{' '}
                    <strong>{failedSKU.available} units</strong> available in inventory.
                    No stock was modified and no order was recorded.
                  </div>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="alert alert-warning flex-col items-start gap-1">
                <div className="font-bold text-amber-900 text-xs uppercase tracking-wider mb-1">
                  Validation Errors (400)
                </div>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Customer input */}
            <div>
              <label className="label">Customer Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Fore Coffee Senopati"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value)
                  setValidationErrors([])
                }}
                disabled={saving}
                required
              />
            </div>

            {/* Order Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Order Items (1 or more)</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="btn btn-secondary text-xs py-1 px-2.5"
                  disabled={saving}
                >
                  + Add Line Item
                </button>
              </div>

              <div className="space-y-2.5">
                {items.map((item, index) => {
                  const selectedProduct = products.find((p) => p.sku === item.sku)
                  const isFailedLine = failedSKU && failedSKU.sku === item.sku

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        isFailedLine
                          ? 'border-rose-400 bg-rose-50/60 ring-2 ring-rose-300'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-400 w-5">
                        #{index + 1}
                      </span>

                      {/* Product Selector */}
                      <div className="flex-1">
                        <select
                          className="input text-xs"
                          value={item.sku}
                          onChange={(e) =>
                            handleItemChange(index, 'sku', e.target.value)
                          }
                          disabled={saving}
                          required
                        >
                          <option value="">-- Choose active product --</option>
                          {activeProducts.map((p) => (
                            <option key={p.id} value={p.sku}>
                              {p.sku} - {p.name} (Stock: {p.stock} | {formatIDR(p.price)})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity input */}
                      <div className="w-24">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className="input text-xs font-mono font-semibold"
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) =>
                            handleItemChange(index, 'qty', e.target.value)
                          }
                          disabled={saving}
                          required
                        />
                      </div>

                      {/* Line Subtotal Preview */}
                      <div className="w-28 text-right text-xs font-bold text-slate-700">
                        {selectedProduct && item.qty !== ''
                          ? formatIDR(selectedProduct.price * Number(item.qty))
                          : 'Rp 0'}
                      </div>

                      {/* Remove Line */}
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="btn-close text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          disabled={saving}
                          title="Remove line item"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Validating & Processing...' : 'Submit Sales Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
