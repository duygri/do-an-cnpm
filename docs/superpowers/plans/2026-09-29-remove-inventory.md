# Remove Inventory Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stock tracking and its database ledger while retaining purchase documents, customer orders, and the approved packing MVP.

**Architecture:** Remove the `InventoryModule` and all `InventoryService`/`InventoryMovement` dependencies. Keep order and import records, but stop checking balances or writing stock movements. Add a forward migration that drops the ledger; its rollback recreates the post-customer-order ledger schema empty because removed movement history cannot be restored.

**Tech Stack:** NestJS 11, TypeScript, TypeORM, PostgreSQL.

---

### Task 1: Remove stock effects from customer orders

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.module.ts`

- [x] Remove `InventoryService` injection and `InventoryModule`/`InventoryMovement` registrations from the order module.
- [x] Preserve duplicate-variant, product-active, variant-existence, price, quantity, and order-total validation. Remove variant locks used only for stock coordination, balance reads, insufficient-stock errors, and sale movement writes from order creation.
- [x] Keep customer cancellation restricted to `pending` and keep its sales-order row lock for serialization with packing. Remove detail-based variant locks and cancellation/restock movement writes; cancellation only updates order status.
- [x] Preserve the existing order response, recipient/shipping snapshots, line quantities, and transaction atomicity for order plus order details.
- [x] Inspect the diff to confirm there is no remaining order-flow dependency on inventory services or balance checks.

### Task 2: Keep purchase records without stock movements

**Files:**
- Modify: `backend/src/imports/imports.service.ts`
- Modify: `backend/src/imports/imports.module.ts`

- [ ] Remove the `InventoryService` dependency and module import from imports.
- [ ] Keep supplier/variant validation, duplicate-line validation, server-side money calculations, and the transaction saving the import header and details.
- [ ] Remove variant row locks used only for inventory coordination and remove import-movement writes. Keep database foreign keys as protection for supplier and variant references.
- [ ] Update the unique-constraint error message so it describes duplicate import lines and does not claim an inventory movement was recorded.
- [ ] Confirm import detail quantities remain purchase-document values only and never feed a sellable balance.

### Task 3: Remove the inventory API and module

**Files:**
- Modify: `backend/src/app.module.ts`
- Delete: `backend/src/inventory/inventory.controller.ts`
- Delete: `backend/src/inventory/inventory.module.ts`
- Delete: `backend/src/inventory/inventory.service.ts`
- Delete: `backend/src/inventory/entities/inventory-movement.entity.ts`
- Delete: `backend/src/inventory/dto/create-opening-balances.dto.ts`
- Delete: `backend/src/inventory/dto/create-stock-adjustment.dto.ts`
- Delete: `backend/src/inventory/dto/get-stock-balance.dto.ts`

- [ ] Unregister `InventoryModule` from the root application module so `/inventory/...` routes are no longer available.
- [ ] Delete the inventory source directory and verify no other runtime module or TypeORM registration references `InventoryMovement`, `InventoryService`, or `InventoryModule`.
- [ ] Keep Suppliers and Imports modules registered.

### Task 4: Drop the inventory ledger with a forward migration

**Files:**
- Create: `backend/src/database/migrations/1790720000000-remove-inventory-ledger.ts`

- [ ] Leave applied historical migrations unchanged. Require an active transaction before migration work; do not set a per-migration transaction override.
- [ ] In `up`, drop `inventory_movement`, removing its ledger rows, indexes, constraints, and foreign keys. Keep `supplier`, `stock_import`, and `import_detail` unchanged.
- [ ] In `down`, recreate the ledger schema as it exists after all current migrations: all columns including nullable `employee_id`, `import_id`, `customer_id`, and `order_id`; variant, employee, import-detail, customer, and composite order-detail foreign keys; quantity/kind/direction-kind checks plus `source` and `actor` checks added `NOT VALID`; and all seven current indexes: `IDX_inventory_movement_variant_effective`, `IDX_inventory_movement_employee_id`, `UQ_inventory_movement_opening_variant`, `UQ_inventory_movement_import_variant`, `IDX_inventory_movement_customer_id`, `UQ_inventory_movement_sale_order_line`, and `UQ_inventory_movement_sale_cancellation_order_line`.
- [ ] Do not restore any ledger rows in `down`; add a clear migration comment that row history was permanently removed by `up`.
- [ ] Review both directions statically. Do not execute rollback as a test.

### Task 5: Align ERD, README, and historical design documents

**Files:**
- Modify: `docs/erd/sales-system-erd.md`
- Modify: `backend/README.md`
- Modify: `docs/superpowers/specs/2026-09-27-supplier-import-inventory-design.md`
- Modify: `docs/superpowers/specs/2026-09-28-customer-order-placement-design.md`
- Modify: `docs/superpowers/specs/2026-09-28-admin-order-processing-design.md`

- [ ] Remove `INVENTORY_MOVEMENT`, its relationships, ledger/balance rules, and stock timing statements from the active ERD. Keep suppliers and import documents; retain the existing recipient snapshot and packing MVP fields.
- [ ] Remove inventory API documentation and all claims that imports/orders/cancellations update or validate stock. Clarify that import quantities are purchase history and order quantities are not checked against available stock.
- [ ] Add a clear supersession notice at the start of the three historical design specs, linking to `docs/superpowers/specs/2026-09-29-remove-inventory-design.md` and stating which stock behaviors are replaced while purchase, customer-order, and packing contracts remain.
- [ ] Document that the migration drops existing movement rows and rollback restores only an empty prior ledger schema.
- [ ] Run `git diff --check` and search for stale inventory claims in active docs and runtime source. Historical migration files may still mention the ledger because they remain immutable.

### Task 6: Verify and prepare integration

**Files:**
- Modify: `docs/superpowers/plans/2026-09-29-remove-inventory.md`

- [ ] Run `npm run format`, `npm run build`, and `npm run lint` from `backend/`.
- [ ] Inspect the configured development database's movement-row count, then run the already approved `npm run db:migrate` and `npm run db:migrations`; confirm the removal migration and all prior migrations show as applied. Do not print `.env` or connection secrets.
- [ ] Run `git diff --check`; statically compare all columns, nullability, five foreign keys, checks (including `NOT VALID` state), and all seven indexes in the recreated rollback schema with the post-`1790700000000-create-customer-orders` ledger schema.
- [ ] Obtain an independent whole-branch review for runtime dependencies, order/import behavior, route removal, migration safety, and documentation consistency.
- [ ] No automated tests are added or run under the approved scope.
- [ ] Mark checkboxes complete only after command and review evidence is available; commit the implementation on `codex/remove-inventory`.

No automated tests are added or run. Verification is limited to formatting, build, ESLint, migration status, diff checks, and code review per the approved scope.
