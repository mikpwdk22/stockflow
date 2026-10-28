package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"stockflow/backend/internal/models"
	"stockflow/backend/internal/repository"
)

type StockHandler struct {
	repo *repository.StockRepository
}

func NewStockHandler(repo *repository.StockRepository) *StockHandler {
	return &StockHandler{repo: repo}
}

func (h *StockHandler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Product ID must be an integer")
		return
	}

	var req models.AdjustStockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	req.Type = strings.ToLower(strings.TrimSpace(req.Type))
	if req.Type != "in" && req.Type != "out" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Movement type must be 'in' or 'out'")
		return
	}

	if req.Qty <= 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Quantity must be an integer greater than 0")
		return
	}

	result, err := h.repo.AdjustStock(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Product not found")
			return
		}
		var insufficientErr *repository.InsufficientStockError
		if errors.As(err, &insufficientErr) {
			RespondErrorWithStock(w, http.StatusConflict, "INSUFFICIENT_STOCK", "Insufficient stock available", "", &insufficientErr.Available)
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to adjust stock: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, result)
}

func (h *StockHandler) GetMovements(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Product ID must be an integer")
		return
	}

	movements, err := h.repo.GetMovementsByProductID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Product not found")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve movements: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{
		"data": movements,
	})
}
