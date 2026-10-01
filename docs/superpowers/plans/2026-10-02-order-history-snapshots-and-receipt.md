# Order history snapshots and MVP receipt terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the purchased product name, size, and color on order lines, expose those snapshots consistently from full-order customer/admin APIs, and accurately describe the existing invoice record as an internal MVP receipt.

**Architecture:** Add three immutable snapshot columns to `order_detail`; a reversible TypeORM migration fills existing lines from current catalog rows. Order placement copies values in its existing transaction. Customer response mapping and admin projections read snapshots without exposing storage-property names. Keep invoice persistence and routes unchanged while aligning the ERD, backend README, and design records.

**Tech Stack:** TypeScript, NestJS 11, TypeORM, PostgreSQL, Node.js built-in test runner, HTTP E2E tests.

---

## Files and responsibilities

- Create `backend/src/database/migrations/1790840000000-add-order-detail-snapshots.ts`: transactional add/backfill/rollback of snapshot columns.
- Modify `backend/src/orders/entities/order-detail.entity.ts`: TypeORM fields for product name, variant size, and variant color snapshots.
- Modify `backend/src/orders/orders.service.ts`: capture snapshot values in the existing transaction and map all full-order customer responses to public detail fields.
- Modify `backend/src/orders/admin-orders.service.ts`: project snapshot values and remove catalog joins used only for historical display values.
- Create `backend/test/order-detail-snapshots-migration.e2e.mjs`: migration backfill, transaction guards, and rollback preservation against an isolated PostgreSQL schema.
- Modify `backend/test/sales-flows.e2e.mjs`: real HTTP order-history regression coverage for customer create/get/cancel and admin order detail.
- Modify `backend/package.json`: include the isolated migration test in `test:e2e`.
- Modify `docs/erd/sales-system-erd.md`: show the three snapshot columns and keep the no-inventory model.
- Modify `backend/README.md`: document customer order detail snapshots and identify `/invoice` as an internal MVP receipt.
- Modify `docs/superpowers/specs/2026-09-28-customer-order-placement-design.md`: align order behavior/API with snapshots and the current no-inventory decision.
- Modify `docs/superpowers/specs/2026-09-28-admin-order-processing-design.md`: use order snapshots and remove stale stock-ledger behavior.
- Modify `docs/superpowers/specs/2026-10-01-internal-invoices-design.md`: make receipt terminology explicit while retaining the `invoice` schema/routes.

Do not change payment logic, voucher usage, tax handling, catalog APIs, frontend code, or order state transitions.

## Task 1: Add and test the order-detail snapshot migration

**Files:**
- Create: `backend/test/order-detail-snapshots-migration.e2e.mjs`
- Create: `backend/src/database/migrations/1790840000000-add-order-detail-snapshots.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write the isolated migration regression test first**

Create a disposable PostgreSQL schema with minimal `product`, `product_variant`, `sales_order`, and `order_detail` tables using the existing column types and foreign keys, including `order_detail`'s foreign keys to its order and variant. Insert multiple order details, including a variant whose size/color are null, and seed catalog values. Load the compiled migration from `dist/database/migrations/1790840000000-add-order-detail-snapshots.js`.

Assert the migration rejects `up` without an active transaction and leaves the original schema untouched. Inside a transaction, apply `up`; assert the historical rows are backfilled from product/variant values, null size/color stay null, and `product_name_snapshot` is non-nullable. Also assert `down` rejects execution outside a transaction without removing columns. In a transaction, apply `down`; assert the three columns disappear while all order-detail IDs, quantities, prices, and subtotals remain unchanged.

Register this file in the `test:e2e` Node test command. The test must refuse any `TEST_DATABASE_URL` whose database name does not end in `_test` and must create/drop only its uniquely named schema.

- [ ] **Step 2: Run the migration test to verify the expected initial failure**

Run from `backend` after `npm run build`:

```powershell
node --test test/order-detail-snapshots-migration.e2e.mjs
```

Expected before the migration exists: the test fails because the compiled migration module is missing. After creating the migration source, rerun the test and use assertion failures to identify any incomplete migration behavior.

- [ ] **Step 3: Implement the minimal migration**

Add nullable `varchar(200)` product-name and nullable `varchar(50)` variant-size/color columns. Backfill with `UPDATE order_detail` joined to `product_variant` and `product`. Then change only `product_name_snapshot` to `NOT NULL`. In both `up` and `down`, check `queryRunner.isTransactionActive` before any database query or DDL. `down` drops only these three columns; it does not delete or rewrite orders or details.

- [ ] **Step 4: Run the isolated migration test and build**

Run from `backend`:

```powershell
npm run build
node --test test/order-detail-snapshots-migration.e2e.mjs
```

Expected: build exits 0 and the migration subtest passes, including both transaction guards and rollback preservation.

- [ ] **Step 5: Commit the migration task**

```powershell
git add backend/test/order-detail-snapshots-migration.e2e.mjs backend/src/database/migrations/1790840000000-add-order-detail-snapshots.ts backend/package.json
git commit -m "feat: snapshot catalog details on order lines"
```

## Task 2: Capture and serve snapshots in customer/admin order APIs

**Files:**
- Modify: `backend/test/sales-flows.e2e.mjs`
- Modify: `backend/src/orders/entities/order-detail.entity.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/admin-orders.service.ts`

- [ ] **Step 1: Add HTTP regression coverage before production changes**

In `sales-flows.e2e.mjs`, add a test with the exact title `snapshots catalog identity across customer and admin order responses`. Create a dedicated active product and variant with distinctive name, size, and color. Place a COD order and assert the `POST /orders` detail returns `productName`, `size`, and `color`, with no `productNameSnapshot`, `variantSizeSnapshot`, or `variantColorSnapshot` keys. Update the product name and variant size/color through their employee APIs. Then assert the original values remain on `GET /orders/:orderId`, `GET /admin/orders/:orderId`, and a successful `POST /orders/:orderId/cancel` response. Place a second order after the edits and assert it captures the new values. Assert `GET /orders` remains a summary without detail rows.

- [ ] **Step 2: Run the focused order-flow test to verify it fails for the missing behavior**

First set `TEST_DATABASE_URL` to the dedicated disposable database whose name ends in `_test`. `npm run test:prepare` resets only that test database and applies all migrations; it refuses database names without the `_test` suffix. Then run from `backend`:

```powershell
npm run test:prepare
npm run build
node --test --test-name-pattern="snapshots catalog identity" test/sales-flows.e2e.mjs
```

Expected: exactly the named test is selected and its new assertions fail because customer details do not yet expose public snapshot fields and admin details still read live catalog values.

- [ ] **Step 3: Add the snapshot fields to the entity and order creation**

Map the three database columns on `OrderDetail`. Extend the existing priced-line data built from variants already loaded inside the order-creation transaction, and include the snapshot values when saving order details. Preserve all existing price, quantity, subtotal, voucher, and payment calculations.

- [ ] **Step 4: Map public customer details and update admin projection**

Make the full-order customer response mapper emit the existing detail fields plus `productName`, `size`, and `color` from snapshot properties. Apply that mapping to every customer response that contains full order details (`POST /orders`, `GET /orders/:orderId`, and `POST /orders/:orderId/cancel`); keep list responses unchanged and never serialize the database snapshot property names.

Update `AdminOrdersService` to select the three snapshot properties from `order_detail`. Remove the `ProductVariant` and `Product` joins that exist only to obtain historical display values. Keep the external admin response keys and sort order unchanged.

- [ ] **Step 5: Rerun the focused regression test and build**

Run from `backend`:

```powershell
npm run test:prepare
npm run build
node --test --test-name-pattern="snapshots catalog identity" test/sales-flows.e2e.mjs
```

Expected: exactly the named test is selected, it passes, and build exits 0.

- [ ] **Step 6: Commit the API task**

```powershell
git add backend/src/orders/entities/order-detail.entity.ts backend/src/orders/orders.service.ts backend/src/orders/admin-orders.service.ts backend/test/sales-flows.e2e.mjs
git commit -m "feat: return order line catalog snapshots"
```

## Task 3: Align ERD, backend docs, and design records

**Files:**
- Modify: `docs/erd/sales-system-erd.md`
- Modify: `backend/README.md`
- Modify: `docs/superpowers/specs/2026-09-28-customer-order-placement-design.md`
- Modify: `docs/superpowers/specs/2026-09-28-admin-order-processing-design.md`
- Modify: `docs/superpowers/specs/2026-10-01-internal-invoices-design.md`

- [ ] **Step 1: Update the corrected ERD**

Add the three snapshot columns to `ORDER_DETAIL` with the approved lengths and nullability. Keep the ERD free of inventory movement/balance entities and retain supplier/import purchase-history records.

- [ ] **Step 2: Update order API and workflow documentation**

Document that order placement stores product-name/size/color snapshots; existing lines are backfilled from current catalog at migration time. State that the create/get/cancel full-order customer responses and admin detail expose `productName`, `size`, and `color`; customer list remains a summary. Correct stale order/packing stock wording in the customer/admin design records so it says the system does not track or mutate stock.

- [ ] **Step 3: Clarify internal MVP receipt terminology**

Keep all existing `invoice` table, entity, fields, and routes. Update the internal-invoice design and backend README to consistently call the record an internal MVP payment receipt (`biên nhận thanh toán nội bộ MVP`) and state it is not an electronic or legally compliant tax invoice. Do not imply tax compliance or add legal/tax claims beyond that scope.

- [ ] **Step 4: Review the documentation diff and commit it**

Run from the repository root:

```powershell
git diff --check
```

Expected: no whitespace errors. Read the complete diff and confirm the ERD, backend README, and three design records agree on snapshots and no-inventory behavior.

```powershell
git add docs/erd/sales-system-erd.md backend/README.md docs/superpowers/specs/2026-09-28-customer-order-placement-design.md docs/superpowers/specs/2026-09-28-admin-order-processing-design.md docs/superpowers/specs/2026-10-01-internal-invoices-design.md
git commit -m "docs: clarify order snapshots and MVP receipts"
```

## Task 4: Verify complete backend behavior

**Files:** no additional files expected.

- [ ] **Step 1: Run the complete backend E2E suite**

Set `TEST_DATABASE_URL` to the already-created disposable PostgreSQL database whose name ends in `_test`; `npm test` recreates its schema and data. Run from `backend`:

```powershell
npm test
```

Expected: test preparation, build, migration rollback/backfill test, sales-flow tests (including vouchers, role access, orders and invoices), and PayOS fake-provider tests all pass. Never point this command at the local development database.

- [ ] **Step 2: Run lint and inspect the final branch diff**

Run from `backend`:

```powershell
npm run lint
```

Run from the repository root:

```powershell
git diff --check
git diff --stat --merge-base codex/employee-role-authorization HEAD
git diff --merge-base codex/employee-role-authorization HEAD
git status --short
```

Expected: lint and whitespace checks exit 0; the merge-base diff shows all work on this feature branch for review; `git status --short` is empty after commits.

- [ ] **Step 3: Complete independent review checkpoints**

After each implementation task, first run a spec-compliance review and address any findings; then run a code-quality review and address any findings before starting the next task. After Task 4, perform a final review against the approved spec and report exact verification results.
