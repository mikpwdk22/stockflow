import React from 'react'
import type { DailySalesReport, DashboardSummary } from '../types/api'
import { formatIDR } from '../utils/formatters'

interface SummaryCardsProps {
  summary: DashboardSummary | null
  dailySales: DailySalesReport | null
  loading: boolean
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  summary,
  dailySales,
  loading,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Products</span>
          <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg text-lg">📦</span>
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {loading ? (
            <div className="h-8 w-16 bg-slate-200 animate-pulse rounded"></div>
          ) : (
            summary?.total_products ?? 0
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1">Catalog items count</div>
      </div>

      {/* Active Products */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Items</span>
          <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-lg">✅</span>
        </div>
        <div className="text-2xl font-bold text-emerald-600">
          {loading ? (
            <div className="h-8 w-16 bg-slate-200 animate-pulse rounded"></div>
          ) : (
            summary?.active_products ?? 0
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1">Ready for sale</div>
      </div>

      {/* Stock Valuation */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation</span>
          <span className="p-2 bg-blue-50 text-blue-600 rounded-lg text-lg">💰</span>
        </div>
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {loading ? (
            <div className="h-8 w-28 bg-slate-200 animate-pulse rounded"></div>
          ) : (
            formatIDR(summary?.total_stock_value ?? 0)
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1">Total inventory worth</div>
      </div>

      {/* Low Stock */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Low Stock (&le; 10)</span>
          <span className="p-2 bg-amber-50 text-amber-600 rounded-lg text-lg">⚠️</span>
        </div>
        <div className="text-2xl font-bold text-amber-600">
          {loading ? (
            <div className="h-8 w-16 bg-slate-200 animate-pulse rounded"></div>
          ) : (
            summary?.low_stock_count ?? 0
          )}
        </div>
        <div className="text-xs text-amber-700 mt-1">Requires reordering</div>
      </div>

      {/* Today Sales */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all hover:shadow-md">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Today's Sales</span>
          <span className="p-2 bg-purple-50 text-purple-600 rounded-lg text-lg">📈</span>
        </div>
        <div className="text-2xl font-bold text-purple-700 tracking-tight">
          {loading ? (
            <div className="h-8 w-24 bg-slate-200 animate-pulse rounded"></div>
          ) : (
            formatIDR(dailySales?.total_revenue ?? 0)
          )}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {dailySales ? `${dailySales.total_orders} orders recorded` : 'Today'}
        </div>
      </div>
    </div>
  )
}
