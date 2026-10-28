package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"stockflow/backend/internal/models"
)

type InsufficientStockError struct {
	Available int
	SKU       string
}

func (e *InsufficientStockError) Error() string {
	if e.SKU != "" {
		return fmt.Sprintf("insufficient stock for sku %s: available %d", e.SKU, e.Available)
	}
	return fmt.Sprintf("insufficient stock: available %d", e.Available)
}

type StockRepository struct {
	pool *pgxpool.Pool
}

func NewStockRepository(pool *pgxpool.Pool) *StockRepository {
	return &StockRepository{pool: pool}
}

func (r *StockRepository) AdjustStock(ctx context.Context, productID int, req models.AdjustStockRequest) (*models.AdjustStockResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Guard inside row lock (FOR UPDATE) - never dirty SELECT-then-UPDATE
	var product models.Product
	query := `
		SELECT id, sku, name, price, stock, is_active, created_at
		FROM products
		WHERE id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, productID).Scan(
		&product.ID,
		&product.SKU,
		&product.Name,
		&product.Price,
		&product.Stock,
		&product.IsActive,
		&product.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to lock product: %w", err)
	}

	newStock := product.Stock
	if req.Type == "out" {
		if product.Stock < req.Qty {
			return nil, &InsufficientStockError{
				Available: product.Stock,
				SKU:       product.SKU,
			}
		}
		newStock = product.Stock - req.Qty
	} else if req.Type == "in" {
		newStock = product.Stock + req.Qty
	} else {
		return nil, fmt.Errorf("invalid movement type: %s", req.Type)
	}

	// Update stock with safety condition
	updateQuery := `
		UPDATE products
		SET stock = $1
		WHERE id = $2
	`
	if _, err := tx.Exec(ctx, updateQuery, newStock, productID); err != nil {
		return nil, fmt.Errorf("failed to update product stock: %w", err)
	}

	// Record movement in the exact same transaction
	movementQuery := `
		INSERT INTO stock_movements (product_id, type, qty, note, created_at)
		VALUES ($1, $2, $3, $4, now())
		RETURNING id, product_id, type, qty, note, created_at
	`
	var movement models.StockMovement
	err = tx.QueryRow(ctx, movementQuery, productID, req.Type, req.Qty, req.Note).Scan(
		&movement.ID,
		&movement.ProductID,
		&movement.Type,
		&movement.Qty,
		&movement.Note,
		&movement.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert stock movement: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit stock adjustment: %w", err)
	}

	product.Stock = newStock
	movementTime := movement.CreatedAt
	product.LastMovementAt = &movementTime

	return &models.AdjustStockResult{
		Product:  product,
		Movement: movement,
	}, nil
}

func (r *StockRepository) GetMovementsByProductID(ctx context.Context, productID int) ([]models.StockMovement, error) {
	// First check if product exists
	var exists bool
	err := r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", productID).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("failed to check product existence: %w", err)
	}
	if !exists {
		return nil, ErrNotFound
	}

	query := `
		SELECT id, product_id, type, qty, note, created_at
		FROM stock_movements
		WHERE product_id = $1
		ORDER BY created_at DESC, id DESC
	`
	rows, err := r.pool.Query(ctx, query, productID)
	if err != nil {
		return nil, fmt.Errorf("failed to query movements: %w", err)
	}
	defer rows.Close()

	movements := make([]models.StockMovement, 0)
	for rows.Next() {
		var m models.StockMovement
		var note *string
		if err := rows.Scan(
			&m.ID,
			&m.ProductID,
			&m.Type,
			&m.Qty,
			&note,
			&m.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan movement: %w", err)
		}
		if note != nil {
			m.Note = *note
		}
		movements = append(movements, m)
	}

	return movements, nil
}
