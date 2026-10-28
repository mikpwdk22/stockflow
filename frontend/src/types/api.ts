// Shared API types in one module - Strict TypeScript, no 'any' on domain data

export interface Product {
  id: number
  sku: string
  name: string
  price: number // IDR, integer
  stock: number
  is_active: boolean
  created_at: string
  last_movement_at: string | null
}

export type MovementType = 'in' | 'out'

export interface StockMovement {
  id: number
  product_id: number
  type: MovementType
  qty: number
  note: string
  created_at: string
}

export type OrderStatus = 'CREATED' | 'CANCELLED'

export interface SalesOrderItem {
  id: number
  order_id: number
  sku: string
  qty: number
  unit_price: number
}

export interface SalesOrder {
  id: number
  customer: string
  status: OrderStatus
  total: number
  idempotency_key?: string | null
  created_at: string
  cancelled_at?: string | null
  items: SalesOrderItem[]
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

export interface CreateProductPayload {
  sku: string
  name: string
  price: number
  stock?: number
  is_active?: boolean
}

export interface UpdateProductPayload {
  name?: string
  price?: number
  is_active?: boolean
}

export interface AdjustStockPayload {
  type: MovementType
  qty: number
  note: string
}

export interface AdjustStockResult {
  product: Product
  movement: StockMovement
}

export interface OrderItemPayload {
  sku: string
  qty: number
}

export interface CreateOrderPayload {
  customer: string
  items: OrderItemPayload[]
}

export interface DashboardSummary {
  total_products: number
  active_products: number
  total_stock_value: number
  low_stock_count: number
}

export interface DailySalesReport {
  date: string
  total_orders: number
  total_revenue: number
  total_items: number
}

// Error envelope parsed from the backend
export interface ApiErrorDetail {
  code: string
  message?: string
  sku?: string
  available?: number
}

export interface ApiErrorEnvelope {
  error: ApiErrorDetail
}

export class ApiError extends Error {
  public code: string
  public sku?: string
  public available?: number
  public status: number

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message || `API Error: ${detail.code}`)
    this.name = 'ApiError'
    this.status = status
    this.code = detail.code
    this.sku = detail.sku
    this.available = detail.available
  }
}
