package models

import "time"

type StockMovement struct {
	ID        int       `json:"id"`
	ProductID int       `json:"product_id"`
	Type      string    `json:"type"` // "in" or "out"
	Qty       int       `json:"qty"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

type AdjustStockRequest struct {
	Type string `json:"type"` // "in" or "out"
	Qty  int    `json:"qty"`
	Note string `json:"note"`
}

type AdjustStockResult struct {
	Product  Product       `json:"product"`
	Movement StockMovement `json:"movement"`
}
