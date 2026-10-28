# StockFlow — Inventory & Sales Management (Mini ERP Module)

A full-stack, concurrency-safe mini ERP system for warehouse supervisors to manage product catalogs, record stock adjustments (intake/deduction), and process multi-item sales orders that consume inventory atomically.

---

## 🛠️ Stack Architecture

* **Frontend**: React 19 + TypeScript (strict mode, no `any` on domain data), Vite, centralized API client, custom responsive ERP UI.
* **Backend**: Go (Go 1.24+), `chi/v5` router, `pgx/v5` connection pool, transactional row locking.
* **Database**: PostgreSQL 16 with ACID transactions, atomic UPDATE stock guards, check constraints, and historical audit trails.
* **Containerization**: Docker & Docker Compose (one-command full stack runner).
* **Testing**:
  * Backend: Go integration & concurrency tests (`internal/repository/order_repo_test.go`).
  * Frontend: Vitest unit tests for validation & pure formatting logic (`src/utils/formatters.test.ts`).

---

## 🚀 Quick Start (≤ 5 minutes)

### Option 1: Full Stack via Docker Compose (Recommended)

Run the entire stack (PostgreSQL + Go API + React UI) in a single command:

```bash
docker compose up --build
```

* **Frontend UI**: [http://localhost:5173](http://localhost:5173)
* **Backend API**: [http://localhost:8080](http://localhost:8080)
* **PostgreSQL**: `localhost:5433` (credentials: `MikoSanjaya` / `stockflowtest` / db `stockflow`)

*(Note: Port 5433 is mapped on the host to avoid collisions with any pre-installed Windows PostgreSQL service).*

---

### Option 2: Local Development Setup

#### 1. Start PostgreSQL
```bash
docker compose up -d db
```
The database will automatically initialize schema migrations and 15 realistic seed items with IDR pricing.

#### 2. Start Go Backend
```bash
cd backend
go run cmd/server/main.go
```
The backend server listens on `http://localhost:8080`.

#### 3. Start Frontend
```bash
cd frontend
npm install
npm run dev
```
The Vite dev server starts on `http://localhost:5173` with automated proxy routing `/api` to `http://localhost:8080`.

---

## 🧪 Running Automated Tests

### 1. Backend Integration & Concurrency Tests
```bash
cd backend
go test -v ./internal/repository/...
```
* **Included test cases**:
  * `TestOrder_InsufficientStock_NothingWritten`: Validates that when any item has insufficient stock, the transaction aborts with HTTP 409 and **NOTHING** is written to products, orders, or stock movements.
  * `TestOrder_HappyPath_UpdatesStockAndWritesMovement`: Tests order creation, server-computed totals, atomic stock decrements, and movement records.
  * `TestOrder_Concurrency_RaceCondition`: Simulates 25 concurrent goroutines competing for 10 units of inventory. Guarantees exactly 10 succeed, 15 fail with 409, and inventory finishes at exactly 0 (never negative).
  * `TestOrder_Cancellation_RestoresStock`: Verifies cancellation restores stock atomically, records audit movement, and prevents double cancellations.

### 2. Frontend Pure Logic Tests (Vitest)
```bash
cd frontend
npm test
```
* **Included test cases**:
  * IDR currency formatter (`formatIDR(1234567)` -> `Rp 1.234.567`).
  * Relative timestamp formatter (`formatRelativeTime`).
  * Multi-item order client validation (customer required, duplicate SKU detection, non-positive quantity prevention).

---

## 🔒 Concurrency & Data Safety Design Decisions

1. **Deadlock Prevention via Deterministic Lock Ordering**:
   When orders contain multiple items, concurrent transactions can easily deadlock if locking rows in arbitrary order. To prevent deadlocks, all requested SKUs are sorted lexicographically before acquiring row locks:
   ```go
   sort.Strings(sortedSKUs)
   for _, sku := range sortedSKUs {
       // SELECT ... FOR UPDATE locks rows in identical order across all goroutines
   }
   ```

2. **Row Locking (`FOR UPDATE`) & Guarded Atomic Updates**:
   We never use dirty `SELECT-then-UPDATE`. We acquire row-level locks using `SELECT ... FOR UPDATE` inside an isolated transaction. Furthermore, the final decrement is guarded inside the `UPDATE` statement:
   ```sql
   UPDATE products
   SET stock = stock - $1
   WHERE id = $2 AND stock >= $1
   ```
   Combined with the database constraint `stock >= 0`, inventory is mathematically guaranteed to never turn negative under extreme concurrency.

3. **Derivation of `last_movement_at`**:
   The API contract requires each product to include `last_movement_at`. We derived this via a single `LEFT JOIN (SELECT product_id, MAX(created_at) FROM stock_movements GROUP BY product_id)` in SQL. This guarantees 100% single-source-of-truth accuracy without duplicate maintenance or risk of cache desynchronization.

4. **Idempotency-Key Support (`POST /api/orders`)**:
   Clients can supply an `Idempotency-Key` header (e.g., UUID). If network timeouts cause a retry, the backend detects the duplicate key and returns the original order without double-decrementing stock.

5. **Cross-Stack Error Handling**:
   The frontend API client parses backend error envelopes `{ "error": { "code": "...", "sku": "...", "available": n } }`.
   * On stock overdraw: The UI highlights the exact failed SKU and shows the available quantity inline (not just logged in console).
   * On product deletion with history: A `409 PRODUCT_HAS_HISTORY` prevents deleting audited stock.

---

## 📡 API Contract & cURL Examples

### 1. Products

#### List Products (with Search, Pagination & Filters)
```bash
curl -X GET "http://localhost:8080/api/products?search=Matcha&page=1&limit=10"
```
**Response (200 OK)**:
```json
{
  "data": [
    {
      "id": 4,
      "sku": "TEA-MATCHA-100",
      "name": "Ceremonial Grade Uji Matcha 100g",
      "price": 165000,
      "stock": 15,
      "is_active": true,
      "created_at": "2026-10-04T13:13:29.327913Z",
      "last_movement_at": "2026-10-28T10:13:29.373146Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 1
}
```

#### Create Product
```bash
curl -X POST "http://localhost:8080/api/products" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "COF-FLORES-250",
    "name": "Flores Bajawa Arabica 250g",
    "price": 89000,
    "stock": 25,
    "is_active": true
  }'
```

#### Delete Product (Guarded against products with history)
```bash
curl -X DELETE "http://localhost:8080/api/products/1"
```
**Response (409 Conflict when product has history)**:
```json
{
  "error": {
    "code": "PRODUCT_HAS_HISTORY",
    "message": "Product has movement history and cannot be deleted"
  }
}
```

---

### 2. Stock Movements

#### Adjust Stock (Intake / Restock)
```bash
curl -X POST "http://localhost:8080/api/products/1/stock" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "in",
    "qty": 10,
    "note": "Shipment restock arrival"
  }'
```

#### Adjust Stock (Overdraw Attempt)
```bash
curl -X POST "http://localhost:8080/api/products/1/stock" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "out",
    "qty": 99999,
    "note": "Excessive deduction"
  }'
```
**Response (409 Conflict)**:
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock available",
    "available": 45
  }
}
```

#### Get Product Movement Audit Trail
```bash
curl -X GET "http://localhost:8080/api/products/1/movements"
```

---

### 3. Sales Orders

#### Create Sales Order (Server Computes Prices & Total)
```bash
curl -X POST "http://localhost:8080/api/orders" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: uuid-sample-12345" \
  -d '{
    "customer": "Kopi Kalyan Barito",
    "items": [
      { "sku": "COF-ACEH-250", "qty": 2 },
      { "sku": "OAT-MILK-1000", "qty": 4 }
    ]
  }'
```
**Response (201 Created)**:
```json
{
  "id": 5,
  "customer": "Kopi Kalyan Barito",
  "status": "CREATED",
  "total": 338000,
  "idempotency_key": "uuid-sample-12345",
  "created_at": "2026-10-28T20:55:00Z",
  "items": [
    { "id": 11, "order_id": 5, "sku": "COF-ACEH-250", "qty": 2, "unit_price": 85000 },
    { "id": 12, "order_id": 5, "sku": "OAT-MILK-1000", "qty": 4, "unit_price": 42000 }
  ]
}
```

#### Cancel Sales Order (Atomically Restores Stock)
```bash
curl -X POST "http://localhost:8080/api/orders/5/cancel"
```
**Response (200 OK)**:
```json
{
  "id": 5,
  "customer": "Kopi Kalyan Barito",
  "status": "CANCELLED",
  "total": 338000,
  "cancelled_at": "2026-10-28T20:56:00Z",
  "items": [...]
}
```

---

### 4. Reports & Summary Cards

#### Dashboard Summary Stats
```bash
curl -X GET "http://localhost:8080/api/reports/summary"
```
**Response (200 OK)**:
```json
{
  "total_products": 15,
  "active_products": 14,
  "total_stock_value": 47908000,
  "low_stock_count": 6
}
```

#### Daily Sales Report
```bash
curl -X GET "http://localhost:8080/api/reports/daily-sales?date=2026-10-28"
```

---

## ⏱️ Honest Hours Spent & Future Improvements

### Honest Hours Spent
* **Database & Schema Modeling**: ~0.75 hours (constraints, foreign keys, realistic seed fixtures in IDR).
* **Go Backend & Concurrency Safe Core**: ~2.5 hours (deterministic lock ordering, atomic checks, error envelopes, tests).
* **Frontend React / TypeScript UI**: ~2.5 hours (strict types, centralized API client, cross-stack 409/400 handling, modals, and design).
* **Integration, Testing & Dockerization**: ~1 hour (Docker Compose multi-stage build, Vitest unit test suite, documentation).
* **Total Focused Effort**: ~6.75 hours.

### What I Would Improve Next
1. **Database Read Replicas & CQRS**: For large-scale warehouses with high read traffic on product search, implement read-replicas for catalog browsing while keeping the primary write master dedicated to transactional row locks.
2. **WebSocket / SSE Live Updates**: Broadcast inventory mutations via Server-Sent Events or WebSockets so multiple warehouse supervisors see stock levels change on screen in real-time without manual refresh.
3. **Partial Order Fulfillment / Backorders**: Allow orders to mark items as partially fulfilled with automated backorder queues when restocked.
4. **Export / CSV Reporting**: Implement downloadable CSV reports for monthly warehouse audits and tax reporting.
