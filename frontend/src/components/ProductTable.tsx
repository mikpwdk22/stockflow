import React from 'react'
import type { Product } from '../types/api'
import { formatIDR, formatRelativeTime } from '../utils/formatters'

interface ProductTableProps {
  products: Product[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onAdjustStock: (product: Product) => void
  onViewMovements: (product: Product) => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  loading,
  error,
  onRetry,
  onAdjustStock,
  onViewMovements,
  onEdit,
  onDelete,
}) => {
  // 1. Error state with retry (Requirement: reachable)
  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center my-6 shadow-sm">
        <div className="text-4xl mb-3">⚠️</div>
        <h4 className="text-lg font-bold text-red-900 mb-1">Failed to Load Products</h4>
        <p className="text-sm text-red-600 mb-5 max-w-md mx-auto">{error}</p>
        <button
          onClick={onRetry}
          className="btn btn-primary bg-red-600 hover:bg-red-700 text-white"
        >
          ↻ Retry Connection
        </button>
      </div>
    )
  }

  // 2. Loading state with skeleton rows (Requirement: reachable)
  if (loading && products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500">
              <th className="p-4">SKU</th>
              <th className="p-4">Product Name</th>
              <th className="p-4">Price</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Status</th>
              <th className="p-4">Last Movement</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5].map((idx) => (
              <tr key={idx} className="animate-pulse">
                <td className="p-4"><div className="h-4 w-24 bg-slate-200 rounded"></div></td>
                <td className="p-4"><div className="h-4 w-40 bg-slate-200 rounded"></div></td>
                <td className="p-4"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                <td className="p-4"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                <td className="p-4"><div className="h-4 w-16 bg-slate-200 rounded"></div></td>
                <td className="p-4"><div className="h-4 w-20 bg-slate-200 rounded"></div></td>
                <td className="p-4 text-right"><div className="h-8 w-28 bg-slate-200 rounded ml-auto"></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // 3. Empty state (Requirement: reachable)
  if (!loading && products.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center my-6 shadow-sm">
        <div className="text-4xl mb-3">🔍</div>
        <h4 className="text-lg font-bold text-slate-800 mb-1">No Products Found</h4>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
          No inventory products match your current search criteria or filter.
        </p>
      </div>
    )
  }

  // 4. Products table
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
              <th className="py-3.5 px-4">SKU</th>
              <th className="py-3.5 px-4">Product Name</th>
              <th className="py-3.5 px-4">Price</th>
              <th className="py-3.5 px-4">Stock</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Last Movement</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {products.map((p) => {
              const isLowStock = p.stock <= 10
              const isOutOfStock = p.stock === 0

              return (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-medium text-indigo-700">
                    {p.sku}
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    {formatIDR(p.price)}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">
                        {p.stock}
                      </span>
                      {isOutOfStock ? (
                        <span className="badge badge-danger text-[10px]">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="badge badge-warning text-[10px]">
                          Low &le; 10
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`badge ${
                        p.is_active ? 'badge-success' : 'badge-inactive'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-500" title={p.last_movement_at || 'No movements yet'}>
                    {formatRelativeTime(p.last_movement_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onAdjustStock(p)}
                        className="btn-table btn-adjust"
                        title="Adjust Stock Quantity"
                      >
                        ± Stock
                      </button>
                      <button
                        onClick={() => onViewMovements(p)}
                        className="btn-table btn-secondary"
                        title="View Movement Audit History"
                      >
                        History
                      </button>
                      <button
                        onClick={() => onEdit(p)}
                        className="btn-table btn-secondary"
                        title="Edit Product Details"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="btn-table btn-danger"
                        title="Delete Product"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
