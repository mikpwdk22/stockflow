package models

type PaginatedResponse[T any] struct {
	Data  []T `json:"data"`
	Page  int `json:"page"`
	Limit int `json:"limit"`
	Total int `json:"total"`
}

type SingleResponse[T any] struct {
	Data T `json:"data"`
}

type ErrorDetail struct {
	Code      string `json:"code"`
	Message   string `json:"message,omitempty"`
	SKU       string `json:"sku,omitempty"`
	Available *int   `json:"available,omitempty"`
}

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}
