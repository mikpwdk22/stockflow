import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ApiError } from '../types/api'
import type { MovementType, Product } from '../types/api'

interface AdjustStockModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  product,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [type, setType] = useState<MovementType>('in')
  const [qty, setQty] = useState<number | ''>(1)
  const [note, setNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [insufficientStockError, setInsufficientStockError] = useState<{
    available: number
    requested: number
  } | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setType('in')
      setQty(1)
      setNote('')
      setClientError(null)
      setInsufficientStockError(null)
      setGeneralError(null)
    }
  }, [isOpen])

  if (!isOpen || !product) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setClientError(null)
    setInsufficientStockError(null)
    setGeneralError(null)

    if (qty === '' || !Number.isInteger(Number(qty)) || Number(qty) <= 0) {
      setClientError('Quantity must be an integer greater than 0')
      return
    }

    setSaving(true)
    try {
      await api.products.adjustStock(product.id, {
        type,
        qty: Number(qty),
        note: note.trim() || (type === 'in' ? 'Manual stock intake' : 'Manual stock deduction'),
      })
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INSUFFICIENT_STOCK') {
          // Requirement: Backend's 409 INSUFFICIENT_STOCK must appear in the UI with available quantity
          setInsufficientStockError({
            available: err.available ?? product.stock,
            requested: Number(qty),
          })
        } else {
          setGeneralError(err.message)
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message)
      } else {
        setGeneralError('An unexpected error occurred while adjusting stock')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-md">
        <form onSubmit={handleSubmit}>
          <div className="modal-header">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Adjust Stock: {product.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                SKU: {product.sku} • Current Stock: {product.stock} units
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-close"
              aria-label="Close"
              disabled={saving}
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* 409 INSUFFICIENT_STOCK Error Banner in UI */}
            {insufficientStockError && (
              <div className="alert alert-error">
                <span className="text-xl">⚠️</span>
                <div>
                  <div className="font-bold text-rose-900">
                    Stock Overdraw Rejected (409)
                  </div>
                  <div className="text-xs text-rose-700 mt-0.5">
                    Cannot deduct {insufficientStockError.requested} units. Only{' '}
                    <strong>{insufficientStockError.available} units</strong> are
                    available in inventory.
                  </div>
                </div>
              </div>
            )}

            {clientError && (
              <div className="alert alert-warning">
                <span>{clientError}</span>
              </div>
            )}

            {generalError && (
              <div className="alert alert-error">
                <span>{generalError}</span>
              </div>
            )}

            {/* Movement Direction */}
            <div>
              <label className="label">Adjustment Direction</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setType('in')
                    setInsufficientStockError(null)
                  }}
                  className={`btn py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    type === 'in'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  disabled={saving}
                >
                  ↑ IN (Restock / Intake)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType('out')
                    setInsufficientStockError(null)
                  }}
                  className={`btn py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    type === 'out'
                      ? 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  disabled={saving}
                >
                  ↓ OUT (Deduction / Spoilage)
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="label">Quantity (Integer &gt; 0)</label>
              <input
                type="number"
                min="1"
                step="1"
                className="input font-mono text-base font-semibold"
                placeholder="1"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value === '' ? '' : Number(e.target.value))
                  setInsufficientStockError(null)
                }}
                disabled={saving}
                required
              />
              {type === 'out' && (
                <p className="text-xs text-slate-400 mt-1">
                  Max available to withdraw: {product.stock} units
                </p>
              )}
            </div>

            {/* Note */}
            <div>
              <label className="label">Reason / Reference Note</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Shipment arrival batch #204, damage spill, etc."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${
                type === 'in'
                  ? 'btn-primary bg-emerald-600 hover:bg-emerald-700'
                  : 'btn-primary bg-rose-600 hover:bg-rose-700'
              }`}
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : type === 'in'
                ? 'Confirm Stock Intake'
                : 'Confirm Stock Deduction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
