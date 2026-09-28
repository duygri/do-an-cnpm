# Customer Order Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer-owned order placement, listing, detail, and pending cancellation while atomically preserving nonnegative stock in the inventory ledger.

**Architecture:** Add a focused OrdersModule over TypeORM and a reversible migration that creates sales_order/order_detail and extends inventory_movement with customer actors and order sources. Order placement, line snapshots, and sale movements share one transaction; cancellation appends compensating sale_cancellation movements and changes order status in one transaction. Existing employee-only stock workflows retain their actor and behavior.

**Tech Stack:** TypeScript, NestJS 11, TypeORM, PostgreSQL, class-validator, existing customer JWT guard, Mermaid.

---

## File map

- Create `backend/src/database/migrations/1790700000000-create-customer-orders.ts`: order tables, order-source ledger FK, actor/source/status checks, indexes, and reversible rollback.
- Create `backend/src/orders/entities/sales-order.entity.ts` and `order-detail.entity.ts`: persisted order and composite-key line snapshots.
- Create `backend/src/orders/dto/create-order.dto.ts` and `get-orders.dto.ts`: strict request validation and pagination.
- Create `backend/src/orders/orders.controller.ts`, `orders.service.ts`, and `orders.module.ts`: customer-guarded endpoints, ownership checks, transactions, price snapshots, and pagination.
- Modify `backend/src/inventory/entities/inventory-movement.entity.ts`: optional employee actor, customer actor and order source relations, cancellation kind.
- Modify `backend/src/inventory/inventory.service.ts` and `inventory.module.ts`: transaction-manager helpers for locked variant/balance reads and customer order/cancellation movements; export the module provider.
- Modify `backend/src/app.module.ts`: register OrdersModule.
- Modify `backend/src/customers/customers.module.ts`: export CustomerJwtGuard for reuse by OrdersModule.
- Modify `docs/erd/sales-system-erd.md`: show recipient snapshots, customer actor, sale-on-order and sale-cancellation relationships and corrected stock rules.
- Modify `backend/README.md`: document order routes, request/response behavior, statuses, validation, stock deduction and cancellation.
- Modify `docs/superpowers/specs/2026-09-27-supplier-import-inventory-design.md`: mark its fulfillment-time deduction rule as superseded by the approved order-placement policy.
- Do not add or run automated tests in this feature, as specified.

## Task 1: Add order persistence and reversible schema migration

**Files:**
- Create: `backend/src/orders/entities/sales-order.entity.ts`
- Create: `backend/src/orders/entities/order-detail.entity.ts`
- Create: `backend/src/database/migrations/1790700000000-create-customer-orders.ts`
- Modify: `backend/src/inventory/entities/inventory-movement.entity.ts`

- [x] Add `sales_order` with generated integer ID, timestamp, customer FK (RESTRICT), recipient snapshot fields, zero-default discount and shipping fee, total, nullable payment method, unpaid payment status, pending/cancelled status, and optional note. Use `numeric(24,2)` for money; add checks preventing negative amounts and unsupported in-scope statuses.
- [x] Add `order_detail` with composite PK `(order_id, variant_id)`, RESTRICT FKs, positive integer quantity, `numeric(12,2)` unit-price snapshot, `numeric(22,2)` subtotal, and nonnegative money checks.
- [x] In the new migration, create order header before detail table, then add nullable `customer_id` and `order_id` columns to `inventory_movement` and make `employee_id` nullable.
- [x] Replace the existing inventory kind/direction/import-source checks with checks for opening/import/sale/sale_cancellation/adjustment, valid direction per kind, source columns per kind, and exactly one actor. Opening/import/adjustment require an employee; sale/sale_cancellation require a customer. Preserve import-detail composite FK and existing import uniqueness.
- [x] Add RESTRICT composite FK `inventory_movement(order_id, variant_id) -> order_detail(order_id, variant_id)`, and partial unique indexes enforcing at most one sale and one cancellation movement per order line.
- [x] Implement rollback in dependency order: delete order-linked sale/cancellation ledger rows, drop new constraints/indexes, remove order/customer source columns, restore employee NOT NULL and the prior check constraints, then drop order detail/header tables.
- [x] Update entity mappings and relationships to match the migration exactly; preserve current import movement creation behavior and employee relation nullability for existing rows.
- [x] Run `npm run build` in `backend/` after this task; expect successful Nest compilation.

## Task 2: Expose transaction-safe customer stock ledger operations

**Files:**
- Modify: `backend/src/inventory/inventory.service.ts`
- Modify: `backend/src/inventory/inventory.module.ts`
- Modify: `backend/src/inventory/entities/inventory-movement.entity.ts`

- [x] Expose transaction-manager-scoped helpers to lock requested variant rows in ascending ID order and read their current net balances as BigInt. Never use JavaScript Number for the aggregate balance.
- [x] Add a helper that accepts an existing `EntityManager`, order ID, customer ID, timestamp, and order-line quantities and writes outbound `sale` movements with the customer actor after order detail rows exist.
- [x] Add a helper that accepts an existing `EntityManager`, order ID, customer ID, timestamp, and quantities and writes inbound `sale_cancellation` movements. It must not edit or remove original movements.
- [x] Keep current opening, import, and adjustment methods attributed to employees; ensure their saves explicitly set nullable customer/order fields to null when needed.
- [x] Export InventoryService from InventoryModule for OrdersModule.
- [x] Run `npm run build` in `backend/`; expect all movement entity relation types and module injection to compile.

## Task 3: Validate and atomically place customer orders

**Files:**
- Create: `backend/src/orders/dto/create-order.dto.ts`
- Create: `backend/src/orders/orders.service.ts`
- Create: `backend/src/orders/entities/sales-order.entity.ts`
- Create: `backend/src/orders/entities/order-detail.entity.ts`

- [x] Validate required trimmed `recipientName` (1–120 chars), `recipientPhone` (1–30 chars), `shippingAddress` (non-empty), 1–100 detail rows, distinct positive PostgreSQL int32 variant IDs, positive int32 quantities, and optional trimmed note. With the global whitelist pipe, reject client-supplied totals, status, prices, discounts, payment fields, and unknown properties.
- [x] In a single `DataSource.transaction`, sort and write-lock all requested variant rows; validate all exist and join their parent products to require `active`; compute each current balance under those locks; reject the entire request when any line is unavailable or exceeds balance.
- [x] Use integer cents/BigInt to snapshot current locked variant prices, calculate line subtotals and the header total. Reject any value that cannot fit the specified PostgreSQL numeric precision rather than relying on rounding.
- [x] Save a pending/unpaid order header with zero discount and shipping fee, then all composite-key detail rows, then sale movements referencing those persisted order lines. Derive customer ID only from the authenticated request.
- [x] Return the saved order with delivery snapshot, server-calculated totals, status/payment state, and ordered line details. Re-read the saved row after commit if needed to include database-generated timestamps/relations.
- [x] Map missing/inactive variants and insufficient balances to a client error with a useful variant identifier; no database writes may remain after these failures.
- [x] Run `npm run build` in `backend/`; expect DTO validation, transaction services, and BigInt money calculations to compile.

## Task 4: Add customer order listing, detail, cancellation, and module wiring

**Files:**
- Create: `backend/src/orders/dto/get-orders.dto.ts`
- Create: `backend/src/orders/orders.controller.ts`
- Create: `backend/src/orders/orders.module.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/customers/customers.module.ts`

- [x] Add `GET /orders?page=1&limit=20`, scoped to customer ID, newest order first, default 1/20, max 100. Return paginated order-header summaries with `items`, `page`, `limit`, and `total`; do not join detail rows into pagination.
- [x] Add `POST /orders` using `CreateOrderDto`; derive customer ID from the authenticated request and delegate to the already transaction-safe `createOrder` service. Return the normal creation response without accepting customer ID from the body.
- [x] Add `GET /orders/:orderId`, scoped to customer ID, with ordered detail rows; reject malformed/out-of-range int32 IDs as not found. An order belonging to another customer also returns not found.
- [x] Add `POST /orders/:orderId/cancel`: in one transaction, pessimistically lock the customer-owned order first, return not found for absent/foreign orders, return conflict unless status is pending, lock its variant IDs ascending, append exactly one customer-attributed cancellation movement per line, and set status to cancelled.
- [x] Guard every controller route with existing `CustomerJwtGuard`; register Order, OrderDetail, InventoryMovement, ProductVariant, and Product repositories. Export CustomerJwtGuard from CustomersModule and import CustomersModule and InventoryModule in OrdersModule; do not register a second CustomerJwtGuard provider.
- [x] Register OrdersModule once in AppModule; do not create duplicate JWT guard providers.
- [x] Run `npm run build` in `backend/`; expect route metadata, guard injection, module graph and repository registrations to compile.

## Task 5: Synchronize ERD and API documentation

**Files:**
- Modify: `docs/erd/sales-system-erd.md`
- Modify: `backend/README.md`
- Modify: `docs/superpowers/specs/2026-09-27-supplier-import-inventory-design.md`

- [ ] Add the three delivery snapshot columns to SALES_ORDER; show CUSTOMER as the actor on order sale/cancellation movements, employee actors on existing admin movements, and two distinct INVENTORY_MOVEMENT relationships to ORDER_DETAIL.
- [ ] Update ERD constraints: sale is outbound at order placement, cancellation is compensating inbound, pending/cancelled orders both have ledger history; remove the previous sentence saying pending/cancelled orders do not create outbound movement.
- [ ] Document each protected customer order route, request fields, default pagination and response envelope, order statuses, server-owned zero fees/discounts, and that live stock is not exposed.
- [ ] Update README stock rules and feature sequencing to state that creation deducts stock atomically and pending cancellation restores it through an appended movement.
- [ ] Mark the supplier/import spec's fulfillment-time deduction sentence as historical and superseded by `2026-09-28-customer-order-placement-design.md`; do not rewrite its earlier approved implementation scope.
- [ ] Run `git diff --check` and visually inspect Mermaid schema/cardinalities and README examples.

## Task 6: Verify schema and publish the completed feature

**Files:** none beyond the files above.

- [ ] Run `npm run format`, `npm run build`, and `npm run lint` from `backend/`; expect all to succeed.
- [ ] Run `git diff --check` and inspect migration/entity parity, actor/source checks, transaction lock order, money bounds, and route ownership filters.
- [ ] Apply the new migration to the already-configured local development PostgreSQL database with `npm run db:migrate`; confirm every migration shows applied using `npm run db:migrations`. This continues the previously authorized local migration workflow. Never print or commit `.env` contents.
- [ ] Commit implementation and docs on `codex/customer-orders`. Handle publication and checkout integration as a separate delivery step after code review.

No automated tests are added or run in this plan. The primary checks are TypeScript build, ESLint, migration status, and review of the transaction and schema constraints.

