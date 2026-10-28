package handlers

import (
	"encoding/json"
	"net/http"

	"stockflow/backend/internal/models"
)

func RespondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

func RespondError(w http.ResponseWriter, status int, code string, message string) {
	RespondJSON(w, status, models.ErrorResponse{
		Error: models.ErrorDetail{
			Code:    code,
			Message: message,
		},
	})
}

func RespondErrorWithStock(w http.ResponseWriter, status int, code string, message string, sku string, available *int) {
	RespondJSON(w, status, models.ErrorResponse{
		Error: models.ErrorDetail{
			Code:      code,
			Message:   message,
			SKU:       sku,
			Available: available,
		},
	})
}
