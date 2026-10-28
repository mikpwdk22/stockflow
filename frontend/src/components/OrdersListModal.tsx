import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SalesOrder } from '../types/api'
import { formatIDR, formatRelativeTime } from '../utils/formatters'

interface OrdersListModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectOrder: (order: SalesOrder) => void
}

export const OrdersListModal: React.FC<OrdersListModalProps> = ({
  isOpen,
  onClose,
  onSelectOrder,
}) => {
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setError(null)
      api.orders
        .list(30)
        .then((res) => setOrders(res.data))
        .catch((err) => setError(err.message || 'Failed to load orders'))
        .finally(() => setLoading(false))
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-3xl">
        <div className="modal-header">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Recent Sales Orders</h3>
            <p className="text-xs text-slate-500">
              Audit trail of warehouse sales orders and customer fulfillment.
            </p>
          </div>
          <button onClick={onClose} className="btn-close" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="py-12 text-center text-slate-500">
              <div className="spinner mx-auto mb-3"></div>
              Loading orders...
            </div>
          )}

          {error && <div className="alert alert-error mb-4">{error}</div>}

          {!loading && !error && orders.length === 0 && (
            <div className="py-12 text-center text-slate-400">
              No sales orders recorded yet.
            </div>
          )}

          {!loading && !error && orders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                    <th className="pb-3">Order ID</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Items Count</th>
                    <th className="pb-3">Total (IDR)</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-3 font-mono font-bold text-indigo-700">
                        #{o.id}
                      </td>
                      <td className="py-3 font-medium text-slate-900">
                        {o.customer}
                      </td>
                      <td className="py-3 text-slate-600">
                        {o.items?.length ?? 0} item(s)
                      </td>
                      <td className="py-3 font-semibold font-mono text-slate-900">
                        {formatIDR(o.total)}
                      </td>
                      <td className="py-3">
                        <span
                          className={`badge ${
                            o.status === 'CREATED'
                              ? 'badge-success'
                              : 'badge-danger'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-slate-500" title={o.created_at}>
                        {formatRelativeTime(o.created_at)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => {
                            onSelectOrder(o)
                            onClose()
                          }}
                          className="btn-table btn-secondary text-xs"
                        >
                          View Details &rarr;
                        </button>
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
