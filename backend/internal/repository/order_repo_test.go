package repository_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"stockflow/backend/internal/database"
	"stockflow/backend/internal/models"
	"stockflow/backend/internal/repository"
)

func setupTestDB(t *testing.T) (*database.DB, func()) {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://MikoSanjaya:stockflowtest@127.0.0.1:5433/stockflow?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	db, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Skipf("Skipping database integration test: %v", err)
	}

	cleanup := func() {
		db.Close()
	}

	return db, cleanup
}

func TestOrder_InsufficientStock_NothingWritten(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	productRepo := repository.NewProductRepository(db.Pool)
	orderRepo := repository.NewOrderRepository(db.Pool)

	// Create a test product with stock 5
	sku := fmt.Sprintf("TEST-INSUF-%d", time.Now().UnixNano())
	price := 50000
	initialStock := 5
	p, err := productRepo.Create(ctx, models.CreateProductRequest{
		SKU:   sku,
		Name:  "Test Insufficient Item",
		Price: &price,
		Stock: &initialStock,
	})
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	// Count movements before
	movementsBefore, err := repository.NewStockRepository(db.Pool).GetMovementsByProductID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get initial movements: %v", err)
	}

	// Attempt order with qty 10 (exceeds stock 5)
	req := models.CreateOrderRequest{
		Customer: "Greedy Customer",
		Items: []models.OrderItemRequest{
			{SKU: sku, Qty: 10},
		},
	}

	order, _, err := orderRepo.Create(ctx, req, "")
	if err == nil {
		t.Fatalf("Expected InsufficientStockError, but order creation succeeded: %+v", order)
	}

	var insufErr *repository.InsufficientStockError
	if !errors.As(err, &insufErr) {
		t.Fatalf("Expected InsufficientStockError, got: %v", err)
	}
	if insufErr.Available != 5 {
		t.Errorf("Expected available 5, got %d", insufErr.Available)
	}

	// Verify NOTHING was written to products (stock still 5)
	pCheck, err := productRepo.GetByID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get product after failed order: %v", err)
	}
	if pCheck.Stock != 5 {
		t.Errorf("Stock was modified on failure! Expected 5, got %d", pCheck.Stock)
	}

	// Verify NO new movement was written
	movementsAfter, err := repository.NewStockRepository(db.Pool).GetMovementsByProductID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get movements after failed order: %v", err)
	}
	if len(movementsAfter) != len(movementsBefore) {
		t.Errorf("Movement was written on failure! Before: %d, After: %d", len(movementsBefore), len(movementsAfter))
	}
}

func TestOrder_HappyPath_UpdatesStockAndWritesMovement(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	productRepo := repository.NewProductRepository(db.Pool)
	orderRepo := repository.NewOrderRepository(db.Pool)
	stockRepo := repository.NewStockRepository(db.Pool)

	sku := fmt.Sprintf("TEST-HAPPY-%d", time.Now().UnixNano())
	price := 30000
	initialStock := 20
	p, err := productRepo.Create(ctx, models.CreateProductRequest{
		SKU:   sku,
		Name:  "Test Happy Item",
		Price: &price,
		Stock: &initialStock,
	})
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	orderReq := models.CreateOrderRequest{
		Customer: "Happy Customer",
		Items: []models.OrderItemRequest{
			{SKU: sku, Qty: 3},
		},
	}

	order, _, err := orderRepo.Create(ctx, orderReq, "")
	if err != nil {
		t.Fatalf("Failed to create happy order: %v", err)
	}

	if order.Status != models.OrderStatusCreated {
		t.Errorf("Expected status CREATED, got %s", order.Status)
	}
	expectedTotal := 3 * price
	if order.Total != expectedTotal {
		t.Errorf("Expected total %d, got %d", expectedTotal, order.Total)
	}

	// Check stock decremented
	pAfter, err := productRepo.GetByID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get product: %v", err)
	}
	expectedStock := initialStock - 3
	if pAfter.Stock != expectedStock {
		t.Errorf("Expected stock %d, got %d", expectedStock, pAfter.Stock)
	}

	// Check movement written
	movements, err := stockRepo.GetMovementsByProductID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get movements: %v", err)
	}
	foundOrderMovement := false
	for _, m := range movements {
		if m.Type == "out" && m.Qty == 3 {
			foundOrderMovement = true
			break
		}
	}
	if !foundOrderMovement {
		t.Errorf("Expected 'out' movement for order not found")
	}
}

func TestOrder_Concurrency_RaceCondition(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	productRepo := repository.NewProductRepository(db.Pool)
	orderRepo := repository.NewOrderRepository(db.Pool)

	// Item with stock = 10
	sku := fmt.Sprintf("TEST-RACE-%d", time.Now().UnixNano())
	price := 10000
	initialStock := 10
	p, err := productRepo.Create(ctx, models.CreateProductRequest{
		SKU:   sku,
		Name:  "Test Race Item",
		Price: &price,
		Stock: &initialStock,
	})
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	// Launch 25 concurrent goroutines, each requesting 1 item
	// Only exactly 10 should succeed, 15 should fail with InsufficientStockError!
	// Stock must end up at exactly 0, NEVER negative!
	concurrentAttempts := 25
	var successCount int64
	var failureCount int64

	var wg sync.WaitGroup
	startBarrier := make(chan struct{})

	for i := 0; i < concurrentAttempts; i++ {
		wg.Add(1)
		go func(buyerID int) {
			defer wg.Done()
			<-startBarrier // synchronize start

			req := models.CreateOrderRequest{
				Customer: fmt.Sprintf("Concurrent Buyer #%d", buyerID),
				Items: []models.OrderItemRequest{
					{SKU: sku, Qty: 1},
				},
			}

			_, _, err := orderRepo.Create(context.Background(), req, "")
			if err == nil {
				atomic.AddInt64(&successCount, 1)
			} else {
				var insufErr *repository.InsufficientStockError
				if errors.As(err, &insufErr) {
					atomic.AddInt64(&failureCount, 1)
				}
			}
		}(i)
	}

	close(startBarrier) // trigger all goroutines at once
	wg.Wait()

	if successCount != int64(initialStock) {
		t.Errorf("Expected exactly %d successful orders, got %d", initialStock, successCount)
	}
	if failureCount != int64(concurrentAttempts-initialStock) {
		t.Errorf("Expected %d failed orders due to insufficient stock, got %d", concurrentAttempts-initialStock, failureCount)
	}

	// Verify final stock is exactly 0 and NEVER negative
	pFinal, err := productRepo.GetByID(ctx, p.ID)
	if err != nil {
		t.Fatalf("Failed to get product: %v", err)
	}
	if pFinal.Stock != 0 {
		t.Errorf("Final stock must be exactly 0, got %d", pFinal.Stock)
	}
}

func TestOrder_Cancellation_RestoresStock(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	productRepo := repository.NewProductRepository(db.Pool)
	orderRepo := repository.NewOrderRepository(db.Pool)

	sku := fmt.Sprintf("TEST-CANCEL-%d", time.Now().UnixNano())
	price := 25000
	initialStock := 10
	p, err := productRepo.Create(ctx, models.CreateProductRequest{
		SKU:   sku,
		Name:  "Test Cancel Item",
		Price: &price,
		Stock: &initialStock,
	})
	if err != nil {
		t.Fatalf("Failed to create test product: %v", err)
	}

	// 1. Create order
	order, _, err := orderRepo.Create(ctx, models.CreateOrderRequest{
		Customer: "Customer To Cancel",
		Items: []models.OrderItemRequest{
			{SKU: sku, Qty: 4},
		},
	}, "")
	if err != nil {
		t.Fatalf("Failed to create order: %v", err)
	}

	// Stock should be 6
	pMid, _ := productRepo.GetByID(ctx, p.ID)
	if pMid.Stock != 6 {
		t.Fatalf("Expected stock 6 after order, got %d", pMid.Stock)
	}

	// 2. Cancel order
	cancelledOrder, err := orderRepo.Cancel(ctx, order.ID)
	if err != nil {
		t.Fatalf("Failed to cancel order: %v", err)
	}
	if cancelledOrder.Status != models.OrderStatusCancelled {
		t.Errorf("Expected status CANCELLED, got %s", cancelledOrder.Status)
	}
	if cancelledOrder.CancelledAt == nil {
		t.Errorf("Expected CancelledAt to be set")
	}

	// Stock must be restored to 10
	pRestored, _ := productRepo.GetByID(ctx, p.ID)
	if pRestored.Stock != 10 {
		t.Errorf("Expected stock restored to 10, got %d", pRestored.Stock)
	}

	// 3. Double cancel must fail with ErrOrderAlreadyCancelled
	_, err = orderRepo.Cancel(ctx, order.ID)
	if !errors.Is(err, repository.ErrOrderAlreadyCancelled) {
		t.Errorf("Expected ErrOrderAlreadyCancelled on second cancel, got %v", err)
	}
}
