import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Product } from '../types/api'
import { ApiError } from '../types/api'

interface ProductModalProps {
  isOpen: boolean
  productToEdit: Product | null
  onClose: () => void
  onSuccess: () => void
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  productToEdit,
  onClose,
  onSuccess,
}) => {
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | ''>('')
  const [initialStock, setInitialStock] = useState<number | ''>(0)
  const [isActive, setIsActive] = useState(true)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = Boolean(productToEdit)

  useEffect(() => {
    if (productToEdit) {
      setSku(productToEdit.sku)
      setName(productToEdit.name)
      setPrice(productToEdit.price)
      setInitialStock(productToEdit.stock)
      setIsActive(productToEdit.is_active)
    } else {
      setSku('')
      setName('')
      setPrice('')
      setInitialStock(0)
      setIsActive(true)
    }
    setError(null)
  }, [productToEdit, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isEditing && !sku.trim()) {
      setError('SKU is required')
      return
    }
    if (!name.trim()) {
      setError('Product name is required')
      return
    }
    if (price === '' || price < 0) {
      setError('Price must be an integer >= 0')
      return
    }

    setSaving(true)
    try {
      if (isEditing && productToEdit) {
        await api.products.update(productToEdit.id, {
          name: name.trim(),
          price: Number(price),
          is_active: isActive,
        })
      } else {
        await api.products.create({
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          price: Number(price),
          stock: initialStock === '' ? 0 : Number(initialStock),
          is_active: isActive,
        })
      }
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SKU_ALREADY_EXISTS') {
          setError(`A product with SKU "${sku.trim().toUpperCase()}" already exists.`)
        } else {
          setError(err.message)
        }
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
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
            <h3 className="text-lg font-bold text-slate-900">
              {isEditing ? 'Edit Product' : 'Add New Product'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="btn-close"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            {error && <div className="alert alert-error">{error}</div>}

            <div>
              <label className="label">Product SKU</label>
              <input
                type="text"
                className="input uppercase font-mono"
                placeholder="e.g. COF-GAYO-250"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                disabled={isEditing || saving}
                required
              />
              {isEditing && (
                <p className="text-xs text-slate-400 mt-1">
                  SKU cannot be altered once created to preserve historical integrity.
                </p>
              )}
            </div>

            <div>
              <label className="label">Product Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Aceh Gayo Arabica 250g"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                required
              />
            </div>

            <div>
              <label className="label">Price (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-medium">
                  Rp
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input pl-10"
                  placeholder="85000"
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  disabled={saving}
                  required
                />
              </div>
            </div>

            {!isEditing && (
              <div>
                <label className="label">Initial Stock</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input font-mono"
                  placeholder="0"
                  value={initialStock}
                  onChange={(e) =>
                    setInitialStock(
                      e.target.value === '' ? '' : Number(e.target.value)
                    )
                  }
                  disabled={saving}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Initial stock creates an automated intake movement.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                id="is_active_checkbox"
                type="checkbox"
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={saving}
              />
              <label
                htmlFor="is_active_checkbox"
                className="text-sm font-medium text-slate-700 cursor-pointer"
              >
                Active for sales orders
              </label>
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
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
