package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"stockflow/backend/internal/models"
)

var (
	ErrNotFound          = errors.New("record not found")
	ErrSKUAlreadyExists  = errors.New("sku already exists")
	ErrProductHasHistory = errors.New("product has movement history")
)

type ProductRepository struct {
	pool *pgxpool.Pool
}

func NewProductRepository(pool *pgxpool.Pool) *ProductRepository {
	return &ProductRepository{pool: pool}
}

func (r *ProductRepository) List(ctx context.Context, filter models.ProductFilter) ([]models.Product, int, error) {
	var conditions []string
	var args []any
	argIndex := 1

	if filter.Search != "" {
		conditions = append(conditions, fmt.Sprintf("(p.sku ILIKE $%d OR p.name ILIKE $%d)", argIndex, argIndex))
		args = append(args, "%"+filter.Search+"%")
		argIndex++
	}

	if filter.Status == "active" {
		conditions = append(conditions, "p.is_active = TRUE")
	} else if filter.Status == "inactive" {
		conditions = append(conditions, "p.is_active = FALSE")
	}

	if filter.LowStock {
		conditions = append(conditions, "p.stock <= 10")
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM products p %s", whereClause)
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count products: %w", err)
	}

	// Limit and offset
	limit := filter.Limit
	if limit <= 0 {
		limit = 10
	}
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * limit

	query := fmt.Sprintf(`
		SELECT p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at, sm.last_movement_at
		FROM products p
		LEFT JOIN (
			SELECT product_id, MAX(created_at) AS last_movement_at
			FROM stock_movements
			GROUP BY product_id
		) sm ON sm.product_id = p.id
		%s
		ORDER BY p.id ASC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	queryArgs := append(args, limit, offset)
	rows, err := r.pool.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query products: %w", err)
	}
	defer rows.Close()

	products := make([]models.Product, 0)
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(
			&p.ID,
			&p.SKU,
			&p.Name,
			&p.Price,
			&p.Stock,
			&p.IsActive,
			&p.CreatedAt,
			&p.LastMovementAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	return products, total, nil
}

func (r *ProductRepository) GetByID(ctx context.Context, id int) (*models.Product, error) {
	query := `
		SELECT p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at, sm.last_movement_at
		FROM products p
		LEFT JOIN (
			SELECT product_id, MAX(created_at) AS last_movement_at
			FROM stock_movements
			GROUP BY product_id
		) sm ON sm.product_id = p.id
		WHERE p.id = $1
	`
	var p models.Product
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&p.ID,
		&p.SKU,
		&p.Name,
		&p.Price,
		&p.Stock,
		&p.IsActive,
		&p.CreatedAt,
		&p.LastMovementAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get product by id: %w", err)
	}
	return &p, nil
}

func (r *ProductRepository) Create(ctx context.Context, req models.CreateProductRequest) (*models.Product, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	initialStock := 0
	if req.Stock != nil {
		initialStock = *req.Stock
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	query := `
		INSERT INTO products (sku, name, price, stock, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, sku, name, price, stock, is_active, created_at
	`
	var p models.Product
	err = tx.QueryRow(ctx, query, req.SKU, req.Name, *req.Price, initialStock, isActive).Scan(
		&p.ID,
		&p.SKU,
		&p.Name,
		&p.Price,
		&p.Stock,
		&p.IsActive,
		&p.CreatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return nil, ErrSKUAlreadyExists
		}
		return nil, fmt.Errorf("failed to insert product: %w", err)
	}

	if initialStock > 0 {
		movementQuery := `
			INSERT INTO stock_movements (product_id, type, qty, note, created_at)
			VALUES ($1, 'in', $2, 'Initial stock on creation', $3)
		`
		if _, err := tx.Exec(ctx, movementQuery, p.ID, initialStock, p.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to record initial stock movement: %w", err)
		}
		p.LastMovementAt = &p.CreatedAt
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &p, nil
}

func (r *ProductRepository) Update(ctx context.Context, id int, req models.UpdateProductRequest) (*models.Product, error) {
	// Build dynamic update
	var updates []string
	var args []any
	args = append(args, id)
	argIdx := 2

	if req.Name != "" {
		updates = append(updates, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, req.Name)
		argIdx++
	}
	if req.Price != nil {
		updates = append(updates, fmt.Sprintf("price = $%d", argIdx))
		args = append(args, *req.Price)
		argIdx++
	}
	if req.IsActive != nil {
		updates = append(updates, fmt.Sprintf("is_active = $%d", argIdx))
		args = append(args, *req.IsActive)
		argIdx++
	}

	if len(updates) == 0 {
		return r.GetByID(ctx, id)
	}

	query := fmt.Sprintf(`
		UPDATE products
		SET %s
		WHERE id = $1
		RETURNING id
	`, strings.Join(updates, ", "))

	var returnedID int
	err := r.pool.QueryRow(ctx, query, args...).Scan(&returnedID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to update product: %w", err)
	}

	return r.GetByID(ctx, id)
}

func (r *ProductRepository) Delete(ctx context.Context, id int) error {
	// First check if product exists
	var exists bool
	err := r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM products WHERE id = $1)", id).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check product existence: %w", err)
	}
	if !exists {
		return ErrNotFound
	}

	// Check if product has stock movements history
	var movementsCount int
	err = r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM stock_movements WHERE product_id = $1", id).Scan(&movementsCount)
	if err != nil {
		return fmt.Errorf("failed to check stock movements: %w", err)
	}
	if movementsCount > 0 {
		return ErrProductHasHistory
	}

	// Delete product
	cmdTag, err := r.pool.Exec(ctx, "DELETE FROM products WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete product: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}
