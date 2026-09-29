# Promotions and Vouchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add employee management for promotion campaigns and vouchers, and apply one eligible voucher atomically during customer order creation.

**Architecture:** Add `promotion` and `promotion_detail` TypeORM entities and a reversible migration; expose employee-protected campaign and nested voucher APIs; extend the existing order transaction to validate voucher rules and snapshot its code, ID, discount, and total. Redemption count is derived from non-cancelled orders, so pending cancellation releases a use without a separate counter.

**Tech Stack:** TypeScript, NestJS 11, PostgreSQL, TypeORM, class-validator, integer-cents/BigInt money calculations.

---

## File map

- `backend/src/database/migrations/1790740000000-create-promotions-vouchers.ts` — create promotion/voucher tables, add the nullable sales-order voucher FK/index, and safely reverse the change.
- `backend/src/promotions/entities/promotion.entity.ts` — promotion campaign mapping and relations.
- `backend/src/promotions/entities/promotion-detail.entity.ts` — voucher mapping, rules, and relation to its promotion.
- `backend/src/promotions/dto/` — validation for promotion and voucher create/update payloads.
- `backend/src/promotions/promotions.controller.ts` — employee-authenticated campaign and nested voucher routes.
- `backend/src/promotions/promotions.service.ts` — reads, creates, and transactionally updates campaigns/vouchers.
- `backend/src/promotions/promotions.module.ts` and `backend/src/app.module.ts` — register the new feature module and entities.
- `backend/src/orders/entities/sales-order.entity.ts` — optional voucher reference.
- `backend/src/orders/orders.module.ts` — register promotion relation entities so TypeORM loads their metadata.
- `backend/src/orders/dto/create-order.dto.ts` — optional normalized voucher code.
- `backend/src/orders/orders.service.ts` — transactional voucher validation, usage-cap serialization, discount calculation, and customer response code.
- `backend/src/orders/admin-orders.service.ts` — include voucher code and discount in employee list/detail responses.
- `backend/README.md` — document promotion APIs, checkout rules, and error behavior.
- `docs/erd/sales-system-erd.md` — document redemption quantity meaning, voucher rules, and the sales-order relation.

## Task 1: Add the promotion and voucher schema

**Files:**
- Create: `backend/src/promotions/entities/promotion.entity.ts`
- Create: `backend/src/promotions/entities/promotion-detail.entity.ts`
- Create: `backend/src/database/migrations/1790740000000-create-promotions-vouchers.ts`
- Modify: `backend/src/orders/entities/sales-order.entity.ts`
- Modify: `backend/src/orders/orders.module.ts`

- [x] **Step 1: Map campaign and voucher columns.** Add generated integer IDs; 120-character names; nullable descriptions; `date` start/end fields; active/inactive statuses; canonical code up to 64 characters; `fixed`/`percentage` type; `numeric(24,2)` discount/minimum/cap values; and positive integer quantity.
- [x] **Step 2: Add the `SalesOrder` relation.** Map nullable `voucher_id` to `promotion_detail.voucher_id` with `ON DELETE RESTRICT`. Keep it optional for existing and voucher-free orders.
- [x] **Step 3: Implement migration `up`.** Create both tables, their campaign FK, status/date/type/money/quantity checks and indexes, including unique constraint `UQ_promotion_detail_code` on the canonical code; add the nullable voucher FK and redemption-count index on `sales_order(voucher_id, status)`.
- [x] **Step 4: Implement guarded migration `down`.** Require an active transaction, acquire `ACCESS EXCLUSIVE` table locks on `promotion`, `promotion_detail`, then `sales_order` before checking voucher references, and refuse rollback if any reference exists. Only then remove the order FK/index/column and drop the voucher and campaign tables.
- [x] **Step 5: Review entity/migration agreement.** Confirm names, nullability, defaults, checks, and FK deletion behavior match the approved spec.
- [x] **Step 6: Register relation metadata and commit the schema slice.** Register both `Promotion` and `PromotionDetail` in `OrdersModule` for the schema-only intermediate state. Commit the migration, entities, `SalesOrder`, and `OrdersModule` changes in focused commits.

## Task 2: Add employee promotion and voucher APIs

**Files:**
- Create: `backend/src/promotions/dto/create-promotion.dto.ts`
- Create: `backend/src/promotions/dto/update-promotion.dto.ts`
- Create: `backend/src/promotions/dto/create-voucher.dto.ts`
- Create: `backend/src/promotions/dto/update-voucher.dto.ts`
- Create: `backend/src/promotions/promotions.controller.ts`
- Create: `backend/src/promotions/promotions.service.ts`
- Create: `backend/src/promotions/promotions.module.ts`
- Modify: `backend/src/app.module.ts`

- [x] **Step 1: Validate campaign DTOs.** Require name and `YYYY-MM-DD` date bounds on create; allow only supplied `name`, `description`, dates, and `active`/`inactive` status on update; reject empty patches and reversed date ranges.
- [x] **Step 2: Validate voucher DTOs.** Normalize code to uppercase and validate allowed characters/length; accept `fixed` or `percentage`; validate positive two-decimal discount, percentage at most 100, nonnegative minimum, percentage-only optional cap, positive quantity, date bounds, and active/inactive status. Never accept code in the update DTO.
- [x] **Step 3: Implement employee-protected routes.** Add the approved GET/POST/PATCH campaign routes and nested voucher list/detail/create/update routes. Return 404 when a voucher does not belong to the route's campaign. Do not add DELETE endpoints.
- [x] **Step 4: Implement read/create operations.** Order results by ID, map entities to intentional API fields, and translate duplicate canonical-code violations into `409 Conflict`.
- [x] **Step 5: Implement safe campaign updates.** In one transaction, lock the campaign row, validate the complete updated date range/status, save, and hold the lock through commit.
- [x] **Step 6: Implement safe voucher updates.** In one transaction, lock campaign then voucher, validate eligibility fields, count orders in `pending` or `packed`, reject a new quantity below that count with `409`, save, and hold both locks through commit. Serialize eligibility changes against checkout.
- [x] **Step 7: Register `PromotionsModule`.** Import employee auth and TypeORM repositories, then add it to `AppModule`.
- [x] **Step 8: Commit the management API slice.** Stage only promotion module files and `backend/src/app.module.ts`; commit with `feat: add promotion management api`.

## Task 3: Apply vouchers during customer checkout

**Files:**
- Modify: `backend/src/orders/dto/create-order.dto.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/admin-orders.service.ts`
- Modify: `backend/src/orders/entities/sales-order.entity.ts` if response relation metadata is needed

- [x] **Step 1: Add optional `voucherCode`.** Trim and uppercase it; reject non-string or overlong values through the DTO. Keep all pricing, voucher ID, and payment fields server-owned.
- [x] **Step 2: Add voucher lookup and eligibility checks to the order transaction.** After pricing active variants, lock promotion then voucher rows, check both statuses and inclusive date ranges using PostgreSQL `CURRENT_DATE`, count redemptions with `status IN ('pending', 'packed')`, and compare the merchandise subtotal with min_price.
- [x] **Step 3: Calculate discounts in cents.** For fixed discounts use the lesser of the fixed amount and merchandise subtotal. For percentage discounts use integer-cent half-up rounding, then apply optional `max_discount` and the subtotal ceiling. Compute `total_amount = merchandise subtotal - discount + shipping fee`.
- [x] **Step 4: Save voucher snapshots atomically.** Store `voucher_id`, `discount_amount`, and the calculated total with order and details. Any unavailable voucher, cap failure, or threshold failure must leave no partial order data. Without a voucher preserve the current zero-discount behavior.
- [x] **Step 5: Return voucher code consistently.** Include nullable `voucherCode` and `discountAmount` in customer create/list/detail responses and employee list/detail responses; keep existing COD/payment fields and access controls unchanged.
- [x] **Step 6: Verify cancellation release behavior.** Confirm the existing pending-only cancellation changes status transactionally, so the derived redemption count stops including the cancelled order exactly once; no separate counter write is added.
- [x] **Step 7: Commit checkout integration.** Stage the order DTO/service/entity changes; commit with `feat: apply vouchers to customer orders`.

## Task 4: Document the feature

**Files:**
- Modify: `backend/README.md`
- Modify: `docs/erd/sales-system-erd.md`

- [ ] **Step 1: Document employee APIs.** Specify routes, payload fields, access, statuses, errors, and the lack of hard delete.
- [ ] **Step 2: Document checkout behavior.** Include a `voucherCode` order example, formula, minimum/cap behavior, global usage count, pending-cancellation release, and COD unchanged.
- [ ] **Step 3: Update the current Mermaid ERD and rules.** Ensure campaign/voucher fields, `sales_order.voucher_id`, FK/index behavior, and global redemption semantics match the migration.
- [ ] **Step 4: Commit documentation.** Stage only the two documentation files; commit with `docs: describe promotion and voucher flow`.

## Task 5: Verify the integrated backend change

- [ ] **Step 1: Run formatting.** From `backend/`, run `npm run format`.
- [ ] **Step 2: Build and lint.** From `backend/`, run `npm run build` and `npm run lint`; resolve all diagnostics before proceeding.
- [ ] **Step 3: Review migration status.** With the configured local database, run `npm run db:migrate` and `npm run db:migrations`; confirm the new migration is applied and prior rows remain intact.
- [ ] **Step 4: Review the final diff.** Run `git diff --check`, inspect all changed files, confirm no frontend files changed, and confirm rollback checks lock before reading voucher references.
- [ ] **Step 5: Commit any verification-driven fixes.** Use a focused commit message describing the fix. Do not run or add automated tests under the current task instructions.

## Execution notes

- Keep tasks sequential because they share the order and promotion schema. After each task, review the diff and commit before starting the next task.
- Preserve the existing COD-only rule, order ownership checks, pending-only cancellation, and no-inventory behavior.
- Do not edit frontend files.
