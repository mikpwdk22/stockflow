package repository

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"stockflow/backend/internal/models"
)

var (
	ErrEmptyCustomer         = errors.New("customer name is required")
	ErrEmptyItems            = errors.New("order must contain at least one item")
	ErrInvalidQty            = errors.New("quantity must be greater than 0")
	ErrDuplicateSKU          = errors.New("duplicate SKU in order items")
	ErrUnknownSKU            = errors.New("unknown sku")
	ErrInactiveProduct       = errors.New("product is inactive and cannot be ordered")
	ErrOrderAlreadyCancelled = errors.New("order is already cancelled")
)

type OrderRepository struct {
	pool *pgxpool.Pool
}

func NewOrderRepository(pool *pgxpool.Pool) *OrderRepository {
	return &OrderRepository{pool: pool}
}

func (r *OrderRepository) Create(ctx context.Context, req models.CreateOrderRequest, idempotencyKey string) (*models.SalesOrder, bool, error) {
	// 1. Validation before transaction
	customer := strings.TrimSpace(req.Customer)
	if customer == "" {
		return nil, false, ErrEmptyCustomer
	}

	if len(req.Items) == 0 {
		return nil, false, ErrEmptyItems
	}

	skuMap := make(map[string]int)
	for _, item := range req.Items {
		sku := strings.TrimSpace(item.SKU)
		if sku == "" {
			return nil, false, ErrUnknownSKU
		}
		if item.Qty <= 0 {
			return nil, false, ErrInvalidQty
		}
		if _, exists := skuMap[sku]; exists {
			return nil, false, fmt.Errorf("%w: %s", ErrDuplicateSKU, sku)
		}
		skuMap[sku] = item.Qty
	}

	// 2. Check Idempotency-Key if provided
	if idempotencyKey != "" {
		existingOrder, err := r.GetByIdempotencyKey(ctx, idempotencyKey)
		if err == nil && existingOrder != nil {
			return existingOrder, true, nil // true = was idempotent cached result
		}
	}

	// 3. Begin transaction
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Sort SKUs lexicographically to avoid concurrent deadlocks when locking rows
	sortedSKUs := make([]string, 0, len(req.Items))
	for _, item := range req.Items {
		sortedSKUs = append(sortedSKUs, strings.TrimSpace(item.SKU))
	}
	sort.Strings(sortedSKUs)

	type lockedProduct struct {
		id       int
		sku      string
		price    int
		stock    int
		isActive bool
	}

	lockedProducts := make(map[string]lockedProduct)

	for _, sku := range sortedSKUs {
		var p lockedProduct
		query := `
			SELECT id, sku, price, stock, is_active
			FROM products
			WHERE sku = $1
			FOR UPDATE
		`
		err := tx.QueryRow(ctx, query, sku).Scan(&p.id, &p.sku, &p.price, &p.stock, &p.isActive)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, false, fmt.Errorf("%w: %s", ErrUnknownSKU, sku)
			}
			return nil, false, fmt.Errorf("failed to lock product %s: %w", sku, err)
		}

		if !p.isActive {
			return nil, false, fmt.Errorf("%w: %s", ErrInactiveProduct, sku)
		}

		requestedQty := skuMap[sku]
		if p.stock < requestedQty {
			return nil, false, &InsufficientStockError{
				SKU:       sku,
				Available: p.stock,
			}
		}

		lockedProducts[sku] = p
	}

	// 4. Calculate total & execute atomic stock decrements
	total := 0
	for _, item := range req.Items {
		sku := strings.TrimSpace(item.SKU)
		p := lockedProducts[sku]
		unitPrice := p.price
		total += unitPrice * item.Qty

		// Guard inside UPDATE: stock = stock - $qty WHERE id = $id AND stock >= $qty
		updateQuery := `
			UPDATE products
			SET stock = stock - $1
			WHERE id = $2 AND stock >= $1
		`
		tag, err := tx.Exec(ctx, updateQuery, item.Qty, p.id)
		if err != nil {
			return nil, false, fmt.Errorf("failed to decrement stock for %s: %w", sku, err)
		}
		if tag.RowsAffected() == 0 {
			return nil, false, &InsufficientStockError{
				SKU:       sku,
				Available: p.stock,
			}
		}
	}

	// 5. Insert sales_orders
	var order models.SalesOrder
	var idempParam *string
	if idempotencyKey != "" {
		idempParam = &idempotencyKey
	}

	orderQuery := `
		INSERT INTO sales_orders (customer, status, total, idempotency_key, created_at)
		VALUES ($1, 'CREATED', $2, $3, now())
		RETURNING id, customer, status, total, idempotency_key, created_at, cancelled_at
	`
	err = tx.QueryRow(ctx, orderQuery, customer, total, idempParam).Scan(
		&order.ID,
		&order.Customer,
		&order.Status,
		&order.Total,
		&order.IdempotencyKey,
		&order.CreatedAt,
		&order.CancelledAt,
	)
	if err != nil {
		return nil, false, fmt.Errorf("failed to insert sales order: %w", err)
	}

	// 6. Insert items and stock movements
	orderItems := make([]models.SalesOrderItem, 0, len(req.Items))
	for _, item := range req.Items {
		sku := strings.TrimSpace(item.SKU)
		p := lockedProducts[sku]

		itemQuery := `
			INSERT INTO sales_order_items (order_id, sku, qty, unit_price)
			VALUES ($1, $2, $3, $4)
			RETURNING id, order_id, sku, qty, unit_price
		`
		var oi models.SalesOrderItem
		err := tx.QueryRow(ctx, itemQuery, order.ID, sku, item.Qty, p.price).Scan(
			&oi.ID,
			&oi.OrderID,
			&oi.SKU,
			&oi.Qty,
			&oi.UnitPrice,
		)
		if err != nil {
			return nil, false, fmt.Errorf("failed to insert order item: %w", err)
		}
		orderItems = append(orderItems, oi)

		// Record 'out' stock movement for this order
		movementQuery := `
			INSERT INTO stock_movements (product_id, type, qty, note, created_at)
			VALUES ($1, 'out', $2, $3, now())
		`
		note := fmt.Sprintf("Sales Order #%d - %s", order.ID, customer)
		if _, err := tx.Exec(ctx, movementQuery, p.id, item.Qty, note); err != nil {
			return nil, false, fmt.Errorf("failed to record movement for order: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("failed to commit order transaction: %w", err)
	}

	order.Items = orderItems
	return &order, false, nil
}

func (r *OrderRepository) GetByID(ctx context.Context, id int) (*models.SalesOrder, error) {
	query := `
		SELECT id, customer, status, total, idempotency_key, created_at, cancelled_at
		FROM sales_orders
		WHERE id = $1
	`
	var order models.SalesOrder
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&order.ID,
		&order.Customer,
		&order.Status,
		&order.Total,
		&order.IdempotencyKey,
		&order.CreatedAt,
		&order.CancelledAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	itemsQuery := `
		SELECT id, order_id, sku, qty, unit_price
		FROM sales_order_items
		WHERE order_id = $1
		ORDER BY id ASC
	`
	rows, err := r.pool.Query(ctx, itemsQuery, id)
	if err != nil {
		return nil, fmt.Errorf("failed to query order items: %w", err)
	}
	defer rows.Close()

	items := make([]models.SalesOrderItem, 0)
	for rows.Next() {
		var item models.SalesOrderItem
		if err := rows.Scan(&item.ID, &item.OrderID, &item.SKU, &item.Qty, &item.UnitPrice); err != nil {
			return nil, fmt.Errorf("failed to scan order item: %w", err)
		}
		items = append(items, item)
	}

	order.Items = items
	return &order, nil
}

func (r *OrderRepository) List(ctx context.Context, limit int) ([]models.SalesOrder, error) {
	if limit <= 0 {
		limit = 20
	}

	query := `
		SELECT id, customer, status, total, idempotency_key, created_at, cancelled_at
		FROM sales_orders
		ORDER BY created_at DESC, id DESC
		LIMIT $1
	`
	rows, err := r.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list orders: %w", err)
	}
	defer rows.Close()

	orders := make([]models.SalesOrder, 0)
	for rows.Next() {
		var order models.SalesOrder
		if err := rows.Scan(
			&order.ID,
			&order.Customer,
			&order.Status,
			&order.Total,
			&order.IdempotencyKey,
			&order.CreatedAt,
			&order.CancelledAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}
		orders = append(orders, order)
	}

	// Fetch items for each order
	for i := range orders {
		itemsQuery := `
			SELECT id, order_id, sku, qty, unit_price
			FROM sales_order_items
			WHERE order_id = $1
			ORDER BY id ASC
		`
		iRows, err := r.pool.Query(ctx, itemsQuery, orders[i].ID)
		if err == nil {
			for iRows.Next() {
				var it models.SalesOrderItem
				_ = iRows.Scan(&it.ID, &it.OrderID, &it.SKU, &it.Qty, &it.UnitPrice)
				orders[i].Items = append(orders[i].Items, it)
			}
			iRows.Close()
		}
	}

	return orders, nil
}

func (r *OrderRepository) GetByIdempotencyKey(ctx context.Context, key string) (*models.SalesOrder, error) {
	var id int
	err := r.pool.QueryRow(ctx, "SELECT id FROM sales_orders WHERE idempotency_key = $1", key).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return r.GetByID(ctx, id)
}

func (r *OrderRepository) Cancel(ctx context.Context, id int) (*models.SalesOrder, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Lock order row
	var order models.SalesOrder
	orderQuery := `
		SELECT id, customer, status, total, idempotency_key, created_at, cancelled_at
		FROM sales_orders
		WHERE id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, orderQuery, id).Scan(
		&order.ID,
		&order.Customer,
		&order.Status,
		&order.Total,
		&order.IdempotencyKey,
		&order.CreatedAt,
		&order.CancelledAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get order: %w", err)
	}

	if order.Status == models.OrderStatusCancelled {
		return nil, ErrOrderAlreadyCancelled
	}

	// 2. Fetch items
	itemsQuery := `
		SELECT id, order_id, sku, qty, unit_price
		FROM sales_order_items
		WHERE order_id = $1
		ORDER BY sku ASC
	`
	rows, err := tx.Query(ctx, itemsQuery, id)
	if err != nil {
		return nil, fmt.Errorf("failed to query order items: %w", err)
	}

	type itemRestore struct {
		sku string
		qty int
	}
	var itemsToRestore []itemRestore
	for rows.Next() {
		var it itemRestore
		var dummyID, dummyOrderID, dummyPrice int
		if err := rows.Scan(&dummyID, &dummyOrderID, &it.sku, &it.qty, &dummyPrice); err != nil {
			rows.Close()
			return nil, fmt.Errorf("failed to scan item: %w", err)
		}
		itemsToRestore = append(itemsToRestore, it)
	}
	rows.Close()

	// 3. Restore stock and write movements
	for _, it := range itemsToRestore {
		var productID int
		err := tx.QueryRow(ctx, "SELECT id FROM products WHERE sku = $1 FOR UPDATE", it.sku).Scan(&productID)
		if err != nil {
			return nil, fmt.Errorf("failed to find product for SKU %s: %w", it.sku, err)
		}

		if _, err := tx.Exec(ctx, "UPDATE products SET stock = stock + $1 WHERE id = $2", it.qty, productID); err != nil {
			return nil, fmt.Errorf("failed to restore stock for %s: %w", it.sku, err)
		}

		note := fmt.Sprintf("Order #%d cancelled - Stock restored", id)
		if _, err := tx.Exec(ctx, "INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES ($1, 'in', $2, $3, now())", productID, it.qty, note); err != nil {
			return nil, fmt.Errorf("failed to record restoration movement: %w", err)
		}
	}

	// 4. Update order status
	now := time.Now()
	updateOrderQuery := `
		UPDATE sales_orders
		SET status = 'CANCELLED', cancelled_at = $1
		WHERE id = $2
	`
	if _, err := tx.Exec(ctx, updateOrderQuery, now, id); err != nil {
		return nil, fmt.Errorf("failed to update order status: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit order cancellation: %w", err)
	}

	return r.GetByID(ctx, id)
}

func (r *OrderRepository) GetDashboardSummary(ctx context.Context) (*models.DashboardSummary, error) {
	query := `
		SELECT
			COUNT(*) AS total_products,
			COUNT(*) FILTER (WHERE is_active = TRUE) AS active_products,
			COALESCE(SUM(price * stock), 0) AS total_stock_value,
			COUNT(*) FILTER (WHERE stock <= 10) AS low_stock_count
		FROM products
	`
	var s models.DashboardSummary
	err := r.pool.QueryRow(ctx, query).Scan(
		&s.TotalProducts,
		&s.ActiveProducts,
		&s.TotalStockValue,
		&s.LowStockCount,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query dashboard summary: %w", err)
	}
	return &s, nil
}

func (r *OrderRepository) GetDailySalesReport(ctx context.Context, dateStr string) (*models.DailySalesReport, error) {
	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	query := `
		SELECT
			COALESCE(COUNT(DISTINCT so.id), 0) AS total_orders,
			COALESCE(SUM(so.total), 0) AS total_revenue,
			COALESCE(SUM(soi.qty), 0) AS total_items
		FROM sales_orders so
		LEFT JOIN sales_order_items soi ON soi.order_id = so.id
		WHERE so.status = 'CREATED' AND date_trunc('day', so.created_at) = $1::date
	`
	var rep models.DailySalesReport
	rep.Date = dateStr
	err := r.pool.QueryRow(ctx, query, dateStr).Scan(
		&rep.TotalOrders,
		&rep.TotalRevenue,
		&rep.TotalItems,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query daily sales report: %w", err)
	}
	return &rep, nil
}
