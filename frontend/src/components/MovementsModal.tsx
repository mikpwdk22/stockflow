import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Product, StockMovement } from '../types/api'
import { formatRelativeTime } from '../utils/formatters'

interface MovementsModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

export const MovementsModal: React.FC<MovementsModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && product) {
      setLoading(true)
      setError(null)
      api.products
        .getMovements(product.id)
        .then((res) => setMovements(res.data))
        .catch((err) => setError(err.message || 'Failed to load movements'))
        .finally(() => setLoading(false))
    } else {
      setMovements([])
    }
  }, [isOpen, product])

  if (!isOpen || !product) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl">
        <div className="modal-header">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Movement History: {product.name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              SKU: {product.sku} • Current Stock: {product.stock} units
            </p>
          </div>
          <button onClick={onClose} className="btn-close" aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="py-12 text-center text-slate-500">
              <div className="spinner mx-auto mb-3"></div>
              Loading movement history...
            </div>
          )}

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && movements.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              No stock movements recorded for this product yet.
            </div>
          )}

          {!loading && !error && movements.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Qty</th>
                    <th className="pb-3">Note / Reason</th>
                    <th className="pb-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3">
                        <span
                          className={`badge ${
                            m.type === 'in'
                              ? 'badge-success'
                              : 'badge-danger'
                          }`}
                        >
                          {m.type === 'in' ? '↑ IN (Restock)' : '↓ OUT (Consumed)'}
                        </span>
                      </td>
                      <td className="py-3 font-semibold font-mono">
                        {m.type === 'in' ? `+${m.qty}` : `-${m.qty}`}
                      </td>
                      <td className="py-3 text-slate-600 max-w-xs truncate">
                        {m.note || '-'}
                      </td>
                      <td className="py-3 text-right text-xs text-slate-500" title={m.created_at}>
                        {formatRelativeTime(m.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
