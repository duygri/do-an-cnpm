# COD Payment Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Each task gets a spec-compliance review followed by a code-quality review.

**Goal:** Add backend-only cash-on-delivery confirmation for packed customer orders, with payment and employee confirmation metadata protected by PostgreSQL constraints.

**Architecture:** New customer orders are assigned COD and remain unpaid until an active employee confirms full cash receipt. Confirmation locks the order row, records server time and employee, and does not change fulfillment status. A forward TypeORM migration expands payment constraints and safely refuses rollback after a payment has been confirmed.

**Tech Stack:** TypeScript, NestJS 11, TypeORM, PostgreSQL.

---

## File map

- `backend/src/orders/entities/sales-order.entity.ts`: payment method/status types, database checks, and confirmation columns. Confirmation columns are excluded from ordinary TypeORM selects.
- `backend/src/database/migrations/1790730000000-add-cod-payment-confirmation.ts`: reversible schema change with a guarded rollback.
- `backend/src/orders/orders.service.ts`: assign COD to every new order.
- `backend/src/orders/admin-orders.controller.ts`: expose the employee-only mark-paid action.
- `backend/src/orders/admin-orders.service.ts`: validate and record a confirmation transactionally, then return the admin order projection.
- `backend/README.md`: describe customer order defaults and the employee payment action.
- `docs/erd/sales-system-erd.md`: add the payment confirmation fields and rules to the current ERD.
- `README.md`: correct the project status so it no longer claims inventory-ledger tracking and include the COD payment milestone.
- Do not modify files under `frontend/`.

## Execution constraints

- Follow the approved specification in `docs/superpowers/specs/2026-09-29-cod-payment-design.md`.
- Implement tasks sequentially because the API depends on the schema and entity changes.
- Use a fresh implementer subagent for each task. After each implementation, run the spec-compliance review first, then the code-quality review; resolve findings before the next task.
- Do not add or run automated tests. Verify with formatting, build, lint, migration status/application when the configured local database is available, and `git diff --check`.
- Preserve legacy orders with `payment_method = NULL`; do not relabel historical payments.

### Task 1: Add COD payment persistence

**Files:**
- Modify: `backend/src/orders/entities/sales-order.entity.ts`
- Create: `backend/src/database/migrations/1790730000000-add-cod-payment-confirmation.ts`

- [ ] Update entity types: `SalesOrderPaymentMethod = 'cod'`; `SalesOrderPaymentStatus = 'unpaid' | 'paid'`. Keep `paymentMethod` nullable to preserve historical rows.
- [ ] Add entity checks that match the migration:
  - `payment_method IS NULL OR payment_method = 'cod'`.
  - `payment_status IN ('unpaid', 'paid')`.
  - An unpaid order has null confirmation time and employee ID; a paid order has non-null `payment_method = 'cod'`, confirmation time, and employee ID.
- [ ] Add nullable `paymentConfirmedAt` (`timestamptz`) and `paymentConfirmedByEmployeeId` (`integer`) entity columns. Mark both `select: false` so customer endpoints that serialize `SalesOrder` cannot expose confirmation metadata.
- [ ] In migration `up`, require an active transaction; add the columns, restrictive employee FK, and constraints; replace the prior unpaid-only check. Existing null payment methods and unpaid statuses must continue to satisfy all constraints.
- [ ] In migration `down`, require an active transaction; acquire `LOCK TABLE "sales_order" IN ACCESS EXCLUSIVE MODE` before counting paid rows; throw a clear error when any paid row exists; otherwise remove the new FK/checks/columns and restore the original `payment_status IN ('unpaid')` constraint.
- [ ] Commit this persistence task after self-review.

### Task 2: Add order creation default and employee confirmation API

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/admin-orders.controller.ts`
- Modify: `backend/src/orders/admin-orders.service.ts`

- [ ] Set `paymentMethod: 'cod'` for every new order. Keep `paymentStatus: 'unpaid'`, `status: 'pending'`, and do not accept payment fields in `CreateOrderDto`.
- [ ] Add `POST /admin/orders/:orderId/mark-paid`, protected by `EmployeeJwtGuard`. Accept no body; obtain the employee ID from `AuthenticatedRequest` and return HTTP 200.
- [ ] Implement payment confirmation in a database transaction: use the existing order-ID parser so malformed, out-of-range, and unknown IDs all return 404; lock the `sales_order` row; and return 409 unless it is packed, COD, and unpaid. Set `payment_status = 'paid'`, `payment_confirmed_at = CURRENT_TIMESTAMP`, and the authenticated employee ID; do not change order status.
- [ ] Ensure concurrent pack/confirmation and duplicate confirmations serialize on the same order lock. Reload the admin order response within the transaction.
- [ ] Extend the admin detail projection to explicitly select and return `paymentConfirmedAt` and `paymentConfirmedByEmployeeId`. Keep those fields out of customer responses and admin list responses.
- [ ] Commit this API task after self-review.

### Task 3: Update current project documentation

**Files:**
- Modify: `backend/README.md`
- Modify: `docs/erd/sales-system-erd.md`
- Modify: `README.md`

- [ ] Document that new customer orders use `paymentMethod: "cod"` and `paymentStatus: "unpaid"`; the customer cannot choose or override payment fields.
- [ ] Document the employee-only `POST /admin/orders/:orderId/mark-paid` behavior, packed-order requirement, full cash receipt rule, 409 cases, and confirmation fields returned to admins.
- [ ] Add `payment_confirmed_at` and `payment_confirmed_by_employee_id` to the corrected `SALES_ORDER` Mermaid entity and document the payment transition without adding delivery or invoice behavior.
- [ ] Intentionally correct the root README's stale backend status (it still claims an inventory ledger exists after the approved inventory removal) and include the COD payment milestone.
- [ ] Confirm no file under `frontend/` changed; commit this documentation task after review.

### Task 4: Verify the integrated backend change

**Files:** no additional files.

- [ ] Run `npm run format` from `backend/`.
- [ ] Run `npm run build` and `npm run lint` from `backend/`; fix any failures within the backend scope.
- [ ] If the worktree has a valid local database configuration, run `npm run db:migrate` and `npm run db:migrations` from `backend/`; confirm migration `1790730000000` is applied. Do not print or expose `.env` values. If the DB is unavailable, report that migration application remains unverified.
- [ ] Run `git diff --check` and inspect the final diff and status, confirming there are no frontend changes.
- [ ] Obtain one final independent review against the approved spec before reporting completion.

## Acceptance checklist

- Newly placed orders are COD and unpaid; clients cannot supply payment state.
- An active employee can confirm full COD receipt only for a packed, unpaid COD order.
- Confirmation stores server time and employee attribution and leaves the order packed.
- Repeated, pending, cancelled, paid, or non-COD confirmation attempts return 409 without changing data; malformed, out-of-range, and unknown IDs return 404.
- Customer order responses do not expose confirmation time or employee ID.
- Database constraints, entity definitions, migration, corrected ERD, and backend documentation agree.
- Migration rollback refuses to erase any paid-order confirmation.
- No frontend files change.
