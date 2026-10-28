// Centralized API client module - owns all fetch calls and error envelope parsing.
// Components never build URLs ad hoc.

import type {
  AdjustStockPayload,
  AdjustStockResult,
  ApiErrorEnvelope,
  CreateOrderPayload,
  CreateProductPayload,
  DailySalesReport,
  DashboardSummary,
  PaginatedResponse,
  Product,
  SalesOrder,
  StockMovement,
  UpdateProductPayload,
} from '../types/api'
import { ApiError } from '../types/api'

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`

  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T
  }

  const contentType = response.headers.get('content-type')
  const isJson = contentType && contentType.includes('application/json')
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    if (data && typeof data === 'object' && 'error' in data) {
      const envelope = data as ApiErrorEnvelope
      throw new ApiError(response.status, envelope.error)
    }
    throw new ApiError(response.status, {
      code: 'HTTP_ERROR',
      message: `Request failed with status ${response.status}`,
    })
  }

  return data as T
}

export interface ListProductsParams {
  search?: string
  status?: string // 'all', 'active', 'inactive', 'low_stock'
  page?: number
  limit?: number
}

export const api = {
  products: {
    list: (params?: ListProductsParams): Promise<PaginatedResponse<Product>> => {
      const query = new URLSearchParams()
      if (params?.search) query.set('search', params.search)
      if (params?.status && params.status !== 'all') {
        if (params.status === 'low_stock') {
          query.set('low_stock', 'true')
        } else {
          query.set('status', params.status)
        }
      }
      if (params?.page) query.set('page', params.page.toString())
      if (params?.limit) query.set('limit', params.limit.toString())

      const qs = query.toString()
      return request<PaginatedResponse<Product>>(`/api/products${qs ? `?${qs}` : ''}`)
    },

    get: (id: number): Promise<{ data: Product }> => {
      return request<{ data: Product }>(`/api/products/${id}`)
    },

    create: (payload: CreateProductPayload): Promise<Product> => {
      return request<Product>('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    update: (id: number, payload: UpdateProductPayload): Promise<Product> => {
      return request<Product>(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    },

    delete: (id: number): Promise<void> => {
      return request<void>(`/api/products/${id}`, {
        method: 'DELETE',
      })
    },

    adjustStock: (id: number, payload: AdjustStockPayload): Promise<AdjustStockResult> => {
      return request<AdjustStockResult>(`/api/products/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },

    getMovements: (id: number): Promise<{ data: StockMovement[] }> => {
      return request<{ data: StockMovement[] }>(`/api/products/${id}/movements`)
    },
  },

  orders: {
    list: (limit = 20): Promise<{ data: SalesOrder[] }> => {
      return request<{ data: SalesOrder[] }>(`/api/orders?limit=${limit}`)
    },

    get: (id: number): Promise<SalesOrder> => {
      return request<SalesOrder>(`/api/orders/${id}`)
    },

    create: (payload: CreateOrderPayload, idempotencyKey?: string): Promise<SalesOrder> => {
      const headers: Record<string, string> = {}
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey
      }
      return request<SalesOrder>('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
    },

    cancel: (id: number): Promise<SalesOrder> => {
      return request<SalesOrder>(`/api/orders/${id}/cancel`, {
        method: 'POST',
      })
    },
  },

  reports: {
    getSummary: (): Promise<DashboardSummary> => {
      return request<DashboardSummary>('/api/reports/summary')
    },

    getDailySales: (date?: string): Promise<DailySalesReport> => {
      const query = date ? `?date=${encodeURIComponent(date)}` : ''
      return request<DailySalesReport>(`/api/reports/daily-sales${query}`)
    },
  },
}
