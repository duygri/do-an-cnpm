# Internal invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist one internal invoice per order, atomically when payment is confirmed, and expose a read-only summary to customers and employees.

**Architecture:** Add a restrictive one-to-one `invoice` entity and migration. A shared invoice service issues the snapshot inside the caller's existing transaction and serves role-scoped read routes; order creation, COD confirmation, and PayOS settlement call it only at the approved paid transition points.

**Tech Stack:** NestJS, TypeScript, TypeORM, PostgreSQL.

---

### Task 1: Persist invoice records

**Files:**
- Create `backend/src/invoices/entities/invoice.entity.ts`.
- Create a timestamped migration under `backend/src/database/migrations/`.
- Modify `backend/src/orders/entities/sales-order.entity.ts`.
- Modify `docs/erd/sales-system-erd.md`.

- [ ] Add `invoice` with generated ID, DB issue timestamp, fixed-precision amount snapshot, `issued` status, unique restrictive FK to `sales_order`, and nonnegative amount check; backfill existing paid orders using their payment confirmation timestamp.
- [ ] Add the inverse optional one-to-one relation to `SalesOrder`.
- [ ] Make migration rollback stop before dropping any existing invoice rows.
- [ ] Update the ERD and invoice rules to match the physical schema.

### Task 2: Issue invoices at confirmed payment

**Files:**
- Create `backend/src/invoices/invoices.service.ts` and module.
- Modify `backend/src/orders/orders.service.ts`.
- Modify `backend/src/orders/admin-orders.service.ts`.
- Modify `backend/src/payments/payments.service.ts`.
- Modify `backend/src/orders/orders.module.ts` and `backend/src/payments/payos-payment.module.ts`.

- [ ] Implement an idempotent `issueForPaidOrder(manager, orderId)` operation that rejects unpaid orders and snapshots the order total.
- [ ] Call it during zero-total PayOS order creation.
- [ ] Call it during the employee COD payment confirmation transaction.
- [ ] Call it during full PayOS settlement transaction only.

### Task 3: Expose authorized invoice reads

**Files:**
- Create `backend/src/invoices/invoices.controller.ts`.
- Modify `backend/src/invoices/invoices.module.ts`.

- [ ] Add customer and active-employee GET routes with their existing JWT guards.
- [ ] Scope customer lookups to the authenticated customer's order and return the same `404` for missing or inaccessible invoices.
- [ ] Return only the approved invoice summary fields.

### Task 4: Verify

**Files:** no additional files.

- [ ] Run `npm run build` from `backend/`.
- [ ] Run `npm run lint` from `backend/`.
- [ ] Run `git diff --check` and inspect the final branch diff.
