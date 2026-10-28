package models

import (
	"time"
)

type Product struct {
	ID             int        `json:"id"`
	SKU            string     `json:"sku"`
	Name           string     `json:"name"`
	Price          int        `json:"price"`
	Stock          int        `json:"stock"`
	IsActive       bool       `json:"is_active"`
	CreatedAt      time.Time  `json:"created_at"`
	LastMovementAt *time.Time `json:"last_movement_at"`
}

type CreateProductRequest struct {
	SKU      string `json:"sku"`
	Name     string `json:"name"`
	Price    *int   `json:"price"`
	Stock    *int   `json:"stock,omitempty"`
	IsActive *bool  `json:"is_active,omitempty"`
}

type UpdateProductRequest struct {
	Name     string `json:"name"`
	Price    *int   `json:"price"`
	IsActive *bool  `json:"is_active,omitempty"`
}

type ProductFilter struct {
	Search   string
	Status   string // "all", "active", "inactive"
	LowStock bool   // stock <= 10
	Page     int
	Limit    int
}
