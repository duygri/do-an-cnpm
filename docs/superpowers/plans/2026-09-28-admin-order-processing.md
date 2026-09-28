# Admin Order Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employee APIs for reviewing customer orders and atomically packing a pending order, with the approved one-step `pending` to `packed` transition.

**Architecture:** Keep customer order routes unchanged. Add a dedicated employee controller/service under `orders`, guarded by the existing `EmployeeJwtGuard`; add a `Packing` entity and reversible migration; serialize packing and customer cancellation by locking the same order row. Return explicit employee response projections so customer password hashes and unrequested fields cannot leak.

**Tech Stack:** NestJS 11, TypeScript, TypeORM, PostgreSQL, class-validator.

---

### Task 1: Add packing persistence and packed order state

**Files:**
- Create: `backend/src/orders/entities/packing.entity.ts`
- Modify: `backend/src/orders/entities/sales-order.entity.ts`
- Modify: `backend/src/orders/orders.module.ts`
- Create: `backend/src/database/migrations/1790710000000-create-order-packing.ts`

- [x] Add the `Packing` TypeORM entity mapped to the approved MVP fields: generated `packingId`, server `packingDate`, nullable `packingType` (`bag`/`box`), `status` (`packed`), nullable `note`, `employeeId`, and unique `orderId`; add restrictive Employee and SalesOrder relations without eager loading.
- [x] Add a non-eager one-to-one `SalesOrder.packing` relation and extend `SalesOrderStatus`/status check to `pending | packed | cancelled`.
- [x] Create a migration that adds `packed` to the existing sales-order status check, adds `(status, order_date)` index, creates `packing` with validated columns, checks, unique order index, and restrictive FKs.
- [x] Require `up` and `down` to run only inside an active transaction: check `queryRunner.isTransactionActive` before database work and do not set a per-migration `transaction` override because the repo's default TypeORM `all` mode rejects it. In `down`, acquire `ACCESS EXCLUSIVE` locks on `sales_order` then `packing` (the application lock order), then preflight packed orders and packing rows before any DDL; if either count is nonzero, throw a clear error and make no changes. Otherwise drop the new index/table and restore the original status check.
- [x] Register `Packing` with `TypeOrmModule.forFeature` and preserve the existing customer-order module wiring.
- [x] Review entity/migration parity and run `git diff --check`.

### Task 2: Implement employee order listing and detail

**Files:**
- Create: `backend/src/orders/dto/get-admin-orders.dto.ts`
- Create: `backend/src/orders/admin-orders.service.ts`
- Create: `backend/src/orders/admin-orders.controller.ts`
- Modify: `backend/src/orders/orders.module.ts`

- [ ] Add pagination DTO validation: use `@Type(() => Number)` before `@IsInt`, require page 1..2,147,483,647 and limit 1..100 (default 1/20), and limit optional status to `pending`, `packed`, or `cancelled`.
- [ ] Add `GET /admin/orders`, guarded by `EmployeeJwtGuard`, with deterministic newest-first pagination and `{ items, page, limit, total }`; list only order header summary fields and detail count, not line/address data.
- [ ] Count order lines in a separate batched query so detail joins do not alter list pagination. Return JSON integer counts.
- [ ] Add route ID parsing that accepts only decimal digits and safe integers 1..2,147,483,647; malformed, zero, and out-of-range IDs return not found before reaching PostgreSQL.
- [ ] Add `GET /admin/orders/:orderId` returning only the explicit approved order, detail, variant/product, and nullable packing fields; sort `details` by `variantId`; do not join or serialize the Customer entity or employee password hash.
- [ ] Ensure money serializes as fixed-scale decimal strings and timestamps as ISO 8601 UTC strings.
- [ ] Inspect response projections to confirm IDs, quantities, counts, page, and limit remain JSON integers and absent note/packing fields serialize as null.
- [ ] Import `AuthModule` once and register the new controller/service; reuse `EmployeeJwtGuard`, do not create a duplicate provider.
- [ ] Run `npm run build` in `backend/`.

### Task 3: Add the atomic packing action

**Files:**
- Create: `backend/src/orders/dto/pack-order.dto.ts`
- Modify: `backend/src/orders/admin-orders.controller.ts`
- Modify: `backend/src/orders/admin-orders.service.ts`
- Modify: `backend/src/orders/entities/packing.entity.ts`
- Modify: `backend/src/orders/orders.module.ts`

- [ ] Validate optional `packingType` against `bag | box`; validate optional string note at max 1000 characters; trim values and convert an empty note to null.
- [ ] Add `POST /admin/orders/:orderId/pack`; derive the employee ID only from the authenticated request and ignore no client-owned status/date fields because the DTO rejects unknown fields.
- [ ] In one transaction, pessimistically lock the order, require `pending`, insert one `packed` Packing row with database/server time, update SalesOrder status to `packed`, reload the detail response inside the transaction, then return it.
- [ ] Return `404` for missing orders and `409` for already-packed/cancelled orders; ensure no partial writes.
- [ ] Preserve customer cancellation's pending-only behavior and use the shared order-row lock to serialize concurrent cancellation vs packing. Do not alter inventory movements at pack time.
- [ ] Run `npm run build` and `npm run lint` in `backend/`.

### Task 4: Synchronize order documentation

**Files:**
- Modify: `docs/erd/sales-system-erd.md`
- Modify: `backend/README.md`
- Modify: `docs/superpowers/specs/2026-09-28-admin-order-processing-design.md`

- [ ] Document staff order list/detail/pack routes, exact response fields, decimal/date JSON formats, JSON integer and null serialization rules, validation errors, status rules, and employee guard behavior.
- [ ] Update ERD to include packing cardinality, optional type, packed statuses, unique order FK, employee relation, and no weight/packing-fee fields.
- [ ] State in both docs that stock is deducted at order placement and packing does not add inventory movements; shipping fee is separate from packing.
- [ ] Run `git diff --check` and compare README, ERD, entity, and migration field names/cardinalities.

### Task 5: Verify migration and prepare integration

**Files:**
- Modify: `docs/superpowers/plans/2026-09-28-admin-order-processing.md`

- [ ] Run `npm run format`, `npm run build`, and `npm run lint` from `backend/`; expect success.
- [ ] Run `npm run db:migrate` against the already configured local development database, then `npm run db:migrations`; confirm the new migration is applied and every prior migration remains applied. Do not display or commit `.env` contents.
- [ ] Review the migration and confirm both paths require an active transaction without a per-migration override, and that `down` locks `sales_order` then `packing` before its packed-order/packing-row preflight, throws before any DDL when data exists, and performs only schema rollback when both counts are zero. Do not execute migration rollback or add/run automated tests under the approved no-tests scope.
- [ ] Verify the clean diff, migration/entity parity, employee authentication, safe projections, lock order/cancellation interaction, database constraints, and response serialization.
- [ ] Mark this task and preceding task boxes complete only after the corresponding commands/reviews succeed; commit implementation and docs on `codex/admin-order-processing`.

No automated tests are added or run. Verification is limited to formatting, TypeScript build, ESLint, migration status, diff checks, and code review per the approved feature scope.
