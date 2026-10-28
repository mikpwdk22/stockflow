-- Seed Data: 01_seed_data.sql
-- StockFlow realistic initial dataset

-- 1. Insert 15 realistic products (IDR currency, integer amounts)
INSERT INTO products (id, sku, name, price, stock, is_active, created_at) VALUES
(1, 'COF-ACEH-250', 'Aceh Gayo Arabica Beans 250g', 85000, 45, TRUE, now() - INTERVAL '30 days'),
(2, 'COF-TORJ-250', 'Toraja Kalosi Single Origin 250g', 92000, 28, TRUE, now() - INTERVAL '28 days'),
(3, 'COF-BALI-250', 'Bali Kintamani Natural 250g', 88000, 8, TRUE, now() - INTERVAL '25 days'), -- Low stock
(4, 'TEA-MATCHA-100', 'Ceremonial Grade Uji Matcha 100g', 165000, 15, TRUE, now() - INTERVAL '24 days'),
(5, 'SYR-VANIL-750', 'Madagascar Vanilla Syrup 750ml', 135000, 4, TRUE, now() - INTERVAL '22 days'), -- Low stock
(6, 'SYR-CARAM-750', 'Salted Caramel Syrup 750ml', 135000, 0, TRUE, now() - INTERVAL '20 days'), -- Out of stock
(7, 'OAT-MILK-1000', 'Barista Blend Oat Milk 1L', 42000, 120, TRUE, now() - INTERVAL '18 days'),
(8, 'ALM-MILK-1000', 'Barista Blend Almond Milk 1L', 48000, 6, TRUE, now() - INTERVAL '15 days'), -- Low stock
(9, 'DRP-V60-02', 'Hario V60 Ceramic Dripper 02 White', 240000, 18, TRUE, now() - INTERVAL '14 days'),
(10, 'FIL-V60-100', 'Hario V60 Paper Filter 02 (100 Sheets)', 65000, 75, TRUE, now() - INTERVAL '12 days'),
(11, 'KTL-GOOS-600', 'Fellow Stagg EKG Gooseneck Kettle', 2450000, 3, TRUE, now() - INTERVAL '10 days'), -- Low stock
(12, 'SCL-TIMEM-01', 'Timemore Black Mirror Basic 2 Scale', 550000, 12, TRUE, now() - INTERVAL '8 days'),
(13, 'CUP-TUMB-500', 'Stainless Insulated Tumbler 500ml', 175000, 35, TRUE, now() - INTERVAL '5 days'),
(14, 'CLG-CLEAN-500', 'Espresso Machine Cleaning Powder 500g', 145000, 22, TRUE, now() - INTERVAL '4 days'),
(15, 'DIS-ROBU-250', 'Discontinued Robusta Blend 250g', 45000, 0, FALSE, now() - INTERVAL '40 days'); -- Inactive

ALTER SEQUENCE products_id_seq RESTART WITH 16;

-- 2. Insert initial stock movements (intake)
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
(1, 'in', 50, 'Initial bulk inventory arrival', now() - INTERVAL '29 days'),
(2, 'in', 30, 'Initial bulk inventory arrival', now() - INTERVAL '27 days'),
(3, 'in', 10, 'Initial small batch intake', now() - INTERVAL '24 days'),
(4, 'in', 20, 'Shipment from Kyoto', now() - INTERVAL '23 days'),
(5, 'in', 10, 'Supplier restock batch #102', now() - INTERVAL '21 days'),
(6, 'in', 15, 'Supplier restock batch #103', now() - INTERVAL '19 days'),
(7, 'in', 150, 'Pallet delivery from distributor', now() - INTERVAL '17 days'),
(8, 'in', 10, 'Supplier intake', now() - INTERVAL '14 days'),
(9, 'in', 20, 'Direct import batch', now() - INTERVAL '13 days'),
(10, 'in', 80, 'Direct import batch', now() - INTERVAL '11 days'),
(11, 'in', 5, 'Luxury equipment arrival', now() - INTERVAL '9 days'),
(12, 'in', 15, 'Wholesale arrival', now() - INTERVAL '7 days'),
(13, 'in', 40, 'Merchandise restock', now() - INTERVAL '4 days'),
(14, 'in', 25, 'Maintenance supplies arrival', now() - INTERVAL '3 days');

-- 3. Insert Sample Sales Order 1 (Completed / Created)
-- Customer: Kopi Kenangan Senopati
-- Items: 5x Aceh Gayo (85k = 425k), 30x Oat Milk (42k = 1.260k), 5x Paper Filter (65k = 325k). Total = 2.010.000 IDR
INSERT INTO sales_orders (id, customer, status, total, idempotency_key, created_at) VALUES
(1, 'Kopi Kenangan Senopati', 'CREATED', 2010000, 'seed-order-uuid-001', now() - INTERVAL '2 days');

INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(1, 'COF-ACEH-250', 5, 85000),
(1, 'OAT-MILK-1000', 30, 42000),
(1, 'FIL-V60-100', 5, 65000);

-- Record corresponding 'out' stock movements for Order 1
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
(1, 'out', 5, 'Sales Order #1 - Kopi Kenangan Senopati', now() - INTERVAL '2 days'),
(7, 'out', 30, 'Sales Order #1 - Kopi Kenangan Senopati', now() - INTERVAL '2 days'),
(10, 'out', 5, 'Sales Order #1 - Kopi Kenangan Senopati', now() - INTERVAL '2 days');

-- 4. Insert Sample Sales Order 2 (Completed / Created)
-- Customer: Dua Coffee Cipete
-- Items: 2x Toraja Kalosi (92k = 184k), 2x Bali Kintamani (88k = 176k), 2x Fellow Stagg (2.450k = 4.900k), 3x Timemore Scale (550k = 1.650k). Total = 6.910.000 IDR
INSERT INTO sales_orders (id, customer, status, total, idempotency_key, created_at) VALUES
(2, 'Dua Coffee Cipete', 'CREATED', 6910000, 'seed-order-uuid-002', now() - INTERVAL '1 days');

INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(2, 'COF-TORJ-250', 2, 92000),
(2, 'COF-BALI-250', 2, 88000),
(2, 'KTL-GOOS-600', 2, 2450000),
(2, 'SCL-TIMEM-01', 3, 550000);

-- Record corresponding 'out' stock movements for Order 2
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
(2, 'out', 2, 'Sales Order #2 - Dua Coffee Cipete', now() - INTERVAL '1 days'),
(3, 'out', 2, 'Sales Order #2 - Dua Coffee Cipete', now() - INTERVAL '1 days'),
(11, 'out', 2, 'Sales Order #2 - Dua Coffee Cipete', now() - INTERVAL '1 days'),
(12, 'out', 3, 'Sales Order #2 - Dua Coffee Cipete', now() - INTERVAL '1 days');

-- 5. Insert Sample Sales Order 3 (CANCELLED order to test cancellation audit trail)
INSERT INTO sales_orders (id, customer, status, total, idempotency_key, created_at, cancelled_at) VALUES
(3, 'Caffeine Lounge Kemang', 'CANCELLED', 270000, 'seed-order-uuid-003', now() - INTERVAL '12 hours', now() - INTERVAL '11 hours');

INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(3, 'SYR-VANIL-750', 2, 135000);

-- Order 3 was cancelled, so out was recorded then in was restored:
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
(5, 'out', 2, 'Sales Order #3 - Caffeine Lounge Kemang', now() - INTERVAL '12 hours'),
(5, 'in', 2, 'Order #3 cancelled - Stock restored', now() - INTERVAL '11 hours');

-- Stock movements for Vanilla syrup manual consumption and out-of-stock caramel
INSERT INTO stock_movements (product_id, type, qty, note, created_at) VALUES
(5, 'out', 4, 'Barista sampling & batch spill', now() - INTERVAL '6 hours'),
(6, 'out', 15, 'Seasonal promo batch consumption', now() - INTERVAL '8 hours'),
(8, 'out', 4, 'Kitchen daily preparation', now() - INTERVAL '5 hours'),
(4, 'out', 5, 'Tasting flight showcase', now() - INTERVAL '3 hours'),
(13, 'out', 5, 'Retail counter stock display', now() - INTERVAL '2 hours'),
(14, 'out', 3, 'Monthly bar maintenance routine', now() - INTERVAL '1 hours');

ALTER SEQUENCE sales_orders_id_seq RESTART WITH 4;
ALTER SEQUENCE sales_order_items_id_seq RESTART WITH 8;
ALTER SEQUENCE stock_movements_id_seq RESTART WITH 28;
