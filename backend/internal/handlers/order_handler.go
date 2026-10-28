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

type OrderHandler struct {
	repo *repository.OrderRepository
}

func NewOrderHandler(repo *repository.OrderRepository) *OrderHandler {
	return &OrderHandler{repo: repo}
}

func (h *OrderHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))

	order, _, err := h.repo.Create(r.Context(), req, idempotencyKey)
	if err != nil {
		// Insufficient stock -> 409 {"error":{"code":"INSUFFICIENT_STOCK","sku":"...","available":n}}
		var insufficientErr *repository.InsufficientStockError
		if errors.As(err, &insufficientErr) {
			RespondErrorWithStock(
				w,
				http.StatusConflict,
				"INSUFFICIENT_STOCK",
				insufficientErr.Error(),
				insufficientErr.SKU,
				&insufficientErr.Available,
			)
			return
		}

		// Validation errors -> 400
		if errors.Is(err, repository.ErrEmptyCustomer) ||
			errors.Is(err, repository.ErrEmptyItems) ||
			errors.Is(err, repository.ErrInvalidQty) ||
			errors.Is(err, repository.ErrDuplicateSKU) ||
			errors.Is(err, repository.ErrUnknownSKU) ||
			errors.Is(err, repository.ErrInactiveProduct) {
			RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}

		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create order: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusCreated, order)
}

func (h *OrderHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Order ID must be an integer")
		return
	}

	order, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Order not found")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get order: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, order)
}

func (h *OrderHandler) List(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	orders, err := h.repo.List(r.Context(), limit)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list orders: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, map[string]any{
		"data": orders,
	})
}

func (h *OrderHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Order ID must be an integer")
		return
	}

	order, err := h.repo.Cancel(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Order not found")
			return
		}
		if errors.Is(err, repository.ErrOrderAlreadyCancelled) {
			RespondError(w, http.StatusConflict, "ORDER_ALREADY_CANCELLED", "Order has already been cancelled")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to cancel order: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, order)
}

func (h *OrderHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.repo.GetDashboardSummary(r.Context())
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get dashboard summary: "+err.Error())
		return
	}
	RespondJSON(w, http.StatusOK, summary)
}

func (h *OrderHandler) GetDailySales(w http.ResponseWriter, r *http.Request) {
	dateStr := r.URL.Query().Get("date")
	report, err := h.repo.GetDailySalesReport(r.Context(), dateStr)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get daily sales report: "+err.Error())
		return
	}
	RespondJSON(w, http.StatusOK, report)
}
