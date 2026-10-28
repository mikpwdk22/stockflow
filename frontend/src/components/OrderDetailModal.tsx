import React, { useState } from 'react'
import { api } from '../api/client'
import { ApiError } from '../types/api'
import type { SalesOrder } from '../types/api'
import { formatIDR, formatRelativeTime } from '../utils/formatters'

interface OrderDetailModalProps {
  order: SalesOrder | null
  isOpen: boolean
  onClose: () => void
  onOrderCancelled: () => void
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onOrderCancelled,
}) => {
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !order) return null

  const handleCancelOrder = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel Sales Order #${order.id} for "${order.customer}"?\n\nThis will atomically restore stock for all ${order.items.length} items and record cancellation audit movements.`
    )
    if (!confirmed) return

    setCancelling(true)
    setError(null)
    try {
      await api.orders.cancel(order.id)
      onOrderCancelled()
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_ALREADY_CANCELLED') {
        setError('This order has already been cancelled.')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to cancel order')
      }
    } finally {
      setCancelling(false)
    }
  }

  const isCancelled = order.status === 'CANCELLED'

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-lg">
        <div className="modal-header">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Sales Order #{order.id}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Created {formatRelativeTime(order.created_at)} ({new Date(order.created_at).toLocaleString()})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-close"
            aria-label="Close"
            disabled={cancelling}
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="alert alert-error">{error}</div>}

          {isCancelled && (
            <div className="alert alert-warning">
              <span className="text-lg">🚫</span>
              <div>
                <span className="font-bold">This order was cancelled</span>
                {order.cancelled_at && (
                  <p className="text-xs text-amber-700 mt-0.5">
                    Cancelled on {new Date(order.cancelled_at).toLocaleString()}. Stock was restored to inventory.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-500">Customer:</span>
            <span className="text-sm font-bold text-slate-900">{order.customer}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-slate-100">
            <span className="text-sm font-medium text-slate-500">Order Status:</span>
            <span
              className={`badge font-semibold ${
                isCancelled ? 'badge-danger' : 'badge-success'
              }`}
            >
              {order.status}
            </span>
          </div>

          {/* Items breakdown */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Order Items ({order.items.length})
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
                  {order.items.map((it) => (
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

          {/* Grand total */}
          <div className="flex justify-between items-center pt-2">
            <span className="text-sm font-bold text-slate-700">Order Total:</span>
            <span className="text-xl font-bold text-indigo-700 font-mono">
              {formatIDR(order.total)}
            </span>
          </div>
        </div>

        <div className="modal-footer justify-between">
          <div>
            {!isCancelled && (
              <button
                type="button"
                onClick={handleCancelOrder}
                className="btn btn-danger text-xs py-2 px-3.5"
                disabled={cancelling}
              >
                {cancelling ? 'Restoring Stock...' : 'Cancel Order & Restore Stock'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs"
            disabled={cancelling}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
