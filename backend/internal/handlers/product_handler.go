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

type ProductHandler struct {
	repo *repository.ProductRepository
}

func NewProductHandler(repo *repository.ProductRepository) *ProductHandler {
	return &ProductHandler{repo: repo}
}

func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	search := strings.TrimSpace(query.Get("search"))
	status := strings.TrimSpace(query.Get("status"))

	page, _ := strconv.Atoi(query.Get("page"))
	if page <= 0 {
		page = 1
	}

	limit, _ := strconv.Atoi(query.Get("limit"))
	if limit <= 0 {
		limit = 10
	}

	lowStock := false
	if query.Get("low_stock") == "true" || status == "low_stock" {
		lowStock = true
	}

	filter := models.ProductFilter{
		Search:   search,
		Status:   status,
		LowStock: lowStock,
		Page:     page,
		Limit:    limit,
	}

	products, total, err := h.repo.List(r.Context(), filter)
	if err != nil {
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve products: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, models.PaginatedResponse[models.Product]{
		Data:  products,
		Page:  page,
		Limit: limit,
		Total: total,
	})
}

func (h *ProductHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Product ID must be an integer")
		return
	}

	product, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Product not found")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to get product: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, models.SingleResponse[*models.Product]{Data: product})
}

func (h *ProductHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	req.SKU = strings.TrimSpace(req.SKU)
	req.Name = strings.TrimSpace(req.Name)

	if req.SKU == "" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "SKU is required")
		return
	}
	if req.Name == "" {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Product name is required")
		return
	}
	if req.Price == nil || *req.Price < 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Price must be an integer >= 0")
		return
	}
	if req.Stock != nil && *req.Stock < 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Stock cannot be negative")
		return
	}

	product, err := h.repo.Create(r.Context(), req)
	if err != nil {
		if errors.Is(err, repository.ErrSKUAlreadyExists) {
			RespondError(w, http.StatusConflict, "SKU_ALREADY_EXISTS", "A product with this SKU already exists")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create product: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusCreated, product)
}

func (h *ProductHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Product ID must be an integer")
		return
	}

	var req models.UpdateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" && req.Price == nil && req.IsActive == nil {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "At least one field to update must be provided")
		return
	}
	if req.Price != nil && *req.Price < 0 {
		RespondError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Price must be an integer >= 0")
		return
	}

	product, err := h.repo.Update(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Product not found")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update product: "+err.Error())
		return
	}

	RespondJSON(w, http.StatusOK, product)
}

func (h *ProductHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		RespondError(w, http.StatusBadRequest, "INVALID_ID", "Product ID must be an integer")
		return
	}

	err = h.repo.Delete(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			RespondError(w, http.StatusNotFound, "NOT_FOUND", "Product not found")
			return
		}
		if errors.Is(err, repository.ErrProductHasHistory) {
			// As required by API contract: 409 {"error":{"code":"PRODUCT_HAS_HISTORY"}}
			RespondError(w, http.StatusConflict, "PRODUCT_HAS_HISTORY", "Product has movement history and cannot be deleted")
			return
		}
		RespondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete product: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
