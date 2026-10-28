package models

import "time"

type OrderStatus string

const (
	OrderStatusCreated   OrderStatus = "CREATED"
	OrderStatusCancelled OrderStatus = "CANCELLED"
)

type SalesOrderItem struct {
	ID        int    `json:"id"`
	OrderID   int    `json:"order_id"`
	SKU       string `json:"sku"`
	Qty       int    `json:"qty"`
	UnitPrice int    `json:"unit_price"`
}

type SalesOrder struct {
	ID             int              `json:"id"`
	Customer       string           `json:"customer"`
	Status         OrderStatus      `json:"status"`
	Total          int              `json:"total"`
	IdempotencyKey *string          `json:"idempotency_key,omitempty"`
	CreatedAt      time.Time        `json:"created_at"`
	CancelledAt    *time.Time       `json:"cancelled_at"`
	Items          []SalesOrderItem `json:"items"`
}

type OrderItemRequest struct {
	SKU string `json:"sku"`
	Qty int    `json:"qty"`
}

type CreateOrderRequest struct {
	Customer string             `json:"customer"`
	Items    []OrderItemRequest `json:"items"`
}

type DailySalesReport struct {
	Date         string `json:"date"`
	TotalOrders  int    `json:"total_orders"`
	TotalRevenue int    `json:"total_revenue"`
	TotalItems   int    `json:"total_items"`
}

type DashboardSummary struct {
	TotalProducts   int `json:"total_products"`
	ActiveProducts  int `json:"active_products"`
	TotalStockValue int `json:"total_stock_value"`
	LowStockCount   int `json:"low_stock_count"`
}
