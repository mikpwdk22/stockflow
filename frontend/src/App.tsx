import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import { AdjustStockModal } from './components/AdjustStockModal'
import { CreateOrderModal } from './components/CreateOrderModal'
import { MovementsModal } from './components/MovementsModal'
import { OrderDetailModal } from './components/OrderDetailModal'
import { OrdersListModal } from './components/OrdersListModal'
import { ProductModal } from './components/ProductModal'
import { ProductTable } from './components/ProductTable'
import { SummaryCards } from './components/SummaryCards'
import { useDebounce } from './hooks/useDebounce'
import type { DailySalesReport, DashboardSummary, Product, SalesOrder } from './types/api'
import { ApiError } from './types/api'

export function App() {
  // Products state
  const [products, setProducts] = useState<Product[]>([])
  const [allProductsForDropdown, setAllProductsForDropdown] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'low_stock'>('all')

  const debouncedSearch = useDebounce(search, 350)

  // Loading & error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Summaries
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [dailySales, setDailySales] = useState<DailySalesReport | null>(null)

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [productToEdit, setProductToEdit] = useState<Product | null>(null)

  const [isMovementsModalOpen, setIsMovementsModalOpen] = useState(false)
  const [selectedProductForMovements, setSelectedProductForMovements] = useState<Product | null>(null)

  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false)
  const [selectedProductForStock, setSelectedProductForStock] = useState<Product | null>(null)

  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false)
  const [isOrdersListModalOpen, setIsOrdersListModalOpen] = useState(false)
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<SalesOrder | null>(null)
  const [isOrderDetailModalOpen, setIsOrderDetailModalOpen] = useState(false)

  // Fetch summaries
  const fetchSummaries = useCallback(async () => {
    try {
      const [sumData, dailyData] = await Promise.all([
        api.reports.getSummary(),
        api.reports.getDailySales(),
      ])
      setSummary(sumData)
      setDailySales(dailyData)
    } catch {
      // Quiet fallback for summaries
    }
  }, [])

  // Fetch all active products for order dropdown
  const fetchDropdownProducts = useCallback(async () => {
    try {
      const res = await api.products.list({ limit: 100 })
      setAllProductsForDropdown(res.data)
    } catch {
      // Quiet fallback
    }
  }, [])

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.products.list({
        search: debouncedSearch,
        status: statusFilter,
        page,
        limit,
      })
      setProducts(res.data)
      setTotal(res.total)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to connect to the StockFlow server')
      }
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, statusFilter, page, limit])

  useEffect(() => {
    fetchProducts()
    fetchSummaries()
    fetchDropdownProducts()
  }, [fetchProducts, fetchSummaries, fetchDropdownProducts])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter])

  // Delete product handler
  const handleDeleteProduct = async (product: Product) => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete product "${product.name}" (${product.sku})?`
    )
    if (!confirmed) return

    try {
      await api.products.delete(product.id)
      setActionNotice({
        type: 'success',
        message: `Product ${product.sku} was deleted successfully.`,
      })
      fetchProducts()
      fetchSummaries()
      fetchDropdownProducts()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PRODUCT_HAS_HISTORY') {
        setActionNotice({
          type: 'error',
          message: `Cannot delete "${product.sku}": Product has movement history in warehouse. History is never deleted to maintain audit integrity.`,
        })
      } else if (err instanceof Error) {
        setActionNotice({
          type: 'error',
          message: err.message,
        })
      }
    }
  }

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
              SF
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">
                StockFlow
              </h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Inventory & Sales Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsOrdersListModalOpen(true)}
              className="btn btn-secondary bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-xs py-2 px-3 cursor-pointer"
            >
              📋 Sales Orders
            </button>
            <button
              onClick={() => setIsCreateOrderModalOpen(true)}
              className="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 px-3 shadow-sm cursor-pointer"
            >
              + Create Order
            </button>
            <button
              onClick={() => {
                setProductToEdit(null)
                setIsProductModalOpen(true)
              }}
              className="btn btn-primary bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 px-3 shadow-sm cursor-pointer"
            >
              + Add Product
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* Flash action notices */}
        {actionNotice && (
          <div
            className={`alert mb-6 ${
              actionNotice.type === 'error' ? 'alert-error' : 'alert-success'
            } justify-between items-center`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {actionNotice.type === 'error' ? '🚫' : '✓'}
              </span>
              <span>{actionNotice.message}</span>
            </div>
            <button
              onClick={() => setActionNotice(null)}
              className="text-xs font-bold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Summary Cards */}
        <SummaryCards
          summary={summary}
          dailySales={dailySales}
          loading={loading && !summary}
        />

        {/* 2. Search & Filter Bar */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Debounced Search */}
          <div className="relative w-full sm:w-80">
            <span className="absolute left-3 top-2.5 text-slate-400 text-sm">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search by SKU or name..."
              className="input pl-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Tabs: All / Active / Inactive / Low stock (<= 10) */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg w-full sm:w-auto overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Products
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                statusFilter === 'inactive'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
            <button
              onClick={() => setStatusFilter('low_stock')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                statusFilter === 'low_stock'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low Stock (&le; 10)
            </button>
          </div>
        </div>

        {/* 3. Products Table */}
        <ProductTable
          products={products}
          loading={loading}
          error={error}
          onRetry={fetchProducts}
          onAdjustStock={(p) => {
            setSelectedProductForStock(p)
            setIsAdjustStockModalOpen(true)
          }}
          onViewMovements={(p) => {
            setSelectedProductForMovements(p)
            setIsMovementsModalOpen(true)
          }}
          onEdit={(p) => {
            setProductToEdit(p)
            setIsProductModalOpen(true)
          }}
          onDelete={handleDeleteProduct}
        />

        {/* Pagination */}
        {!error && products.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {products.length} of {total} products
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-medium text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Adjust Stock Modal */}
        <AdjustStockModal
          isOpen={isAdjustStockModalOpen}
          product={selectedProductForStock}
          onClose={() => setIsAdjustStockModalOpen(false)}
          onSuccess={() => {
            setActionNotice({
              type: 'success',
              message: `Stock adjusted for ${selectedProductForStock?.sku}. Audit movement recorded.`,
            })
            fetchProducts()
            fetchSummaries()
            fetchDropdownProducts()
          }}
        />

        {/* Create Order Modal */}
        <CreateOrderModal
          isOpen={isCreateOrderModalOpen}
          products={allProductsForDropdown.length > 0 ? allProductsForDropdown : products}
          onClose={() => setIsCreateOrderModalOpen(false)}
          onSuccess={() => {
            fetchProducts()
            fetchSummaries()
            fetchDropdownProducts()
          }}
        />

        {/* Orders List Modal */}
        <OrdersListModal
          isOpen={isOrdersListModalOpen}
          onClose={() => setIsOrdersListModalOpen(false)}
          onSelectOrder={(order) => {
            setSelectedOrderForDetail(order)
            setIsOrderDetailModalOpen(true)
          }}
        />

        {/* Order Detail Modal */}
        <OrderDetailModal
          isOpen={isOrderDetailModalOpen}
          order={selectedOrderForDetail}
          onClose={() => setIsOrderDetailModalOpen(false)}
          onOrderCancelled={() => {
            setActionNotice({
              type: 'success',
              message: `Sales Order #${selectedOrderForDetail?.id} cancelled. Stock visibly restored to inventory!`,
            })
            fetchProducts()
            fetchSummaries()
            fetchDropdownProducts()
          }}
        />

        {/* Product Modal (Create / Edit) */}
        <ProductModal
          isOpen={isProductModalOpen}
          productToEdit={productToEdit}
          onClose={() => setIsProductModalOpen(false)}
          onSuccess={() => {
            fetchProducts()
            fetchSummaries()
            fetchDropdownProducts()
          }}
        />

        {/* Movements Modal */}
        <MovementsModal
          isOpen={isMovementsModalOpen}
          product={selectedProductForMovements}
          onClose={() => setIsMovementsModalOpen(false)}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        StockFlow ERP • Concurrency-Safe Inventory & Sales
      </footer>
    </div>
  )
}

export default App
