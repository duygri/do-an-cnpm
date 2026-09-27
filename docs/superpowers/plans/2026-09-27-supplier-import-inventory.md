# Supplier, Imports, and Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add protected supplier and import APIs plus an auditable inventory ledger that reports `ending = beginning + inbound - outbound`.

**Architecture:** Add separate NestJS supplier, import, and inventory modules over TypeORM entities and one reversible PostgreSQL migration. Imports, details, and inbound ledger movements share one database transaction; opening balances, stock corrections, and period balance reads use the same movement ledger. Sales/order modules will later write outbound movements only when fulfillment occurs.

**Tech Stack:** TypeScript, NestJS 11, TypeORM, PostgreSQL, class-validator, JWT employee guard, Mermaid.

---

## File map

- Create `docs/erd/sales-system-erd.md`: canonical corrected Mermaid ERD including the inventory ledger and corrected keys/cardinalities.
- Modify `README.md`: link the original supplied ERD and corrected Mermaid ERD.
- Create `backend/src/database/migrations/1790528078555-create-supplier-import-inventory.ts`: supplier/import/ledger schema, constraints, and indexes.
- Create entities under `backend/src/suppliers/entities/`, `backend/src/imports/entities/`, and `backend/src/inventory/entities/`.
- Create protected controllers, services, DTOs, and modules under `backend/src/suppliers/`, `backend/src/imports/`, and `backend/src/inventory/`.
- Modify `backend/src/app.module.ts`: register the new domain modules.
- Modify `backend/README.md`: migration schema, API routes, opening stock workflow, adjustment rules, and report date semantics.

## Task 1: Correct and publish the ERD source

**Files:**
- Create: `docs/erd/sales-system-erd.md`
- Modify: `README.md`

- [x] Add a Mermaid entity diagram for the supplied model plus `Inventory_Movement`.
- [x] Mark `Order_Detail(order_id, variant_id)` and `Import_Detail(import_id, variant_id)` as composite primary keys.
- [x] Show `Packing` and `Invoice` as optional one-to-one records per order, with unique `order_id`; remove duplicate `Invoice.method`, retaining the issued total snapshot.
- [x] Mark voucher code and employee/customer email uniqueness; show stock movement links to variants, employees, import detail, and the later order detail source.
- [x] Link both the supplied image and corrected ERD source from the root README so the original is clearly distinguished from the corrected version.

## Task 2: Add persistence entities and migration

**Files:**
- Create: `backend/src/suppliers/entities/supplier.entity.ts`
- Create: `backend/src/imports/entities/stock-import.entity.ts`
- Create: `backend/src/imports/entities/import-detail.entity.ts`
- Create: `backend/src/inventory/entities/inventory-movement.entity.ts`
- Create: `backend/src/database/migrations/1790528078555-create-supplier-import-inventory.ts`

- [x] Define supplier, import header, and import detail entities with explicit PostgreSQL column names, relations, and delete restrictions.
- [x] Define movement direction/kind, employee and variant relations, and the import-detail source relation. Database checks require an import source pair for every import movement, prohibit document sources for opening/adjustment rows, allow zero only for opening quantities, and require direction to match kind. The later order migration adds and enforces the order-detail source pair for sale movements.
- [x] Create tables in dependency order: supplier, import header, import detail, then inventory movement. Use a composite import-detail primary/foreign key and a unique source movement per imported variant.
- [x] Add FK indexes, quantity/money checks, unique opening movement per variant, and numeric precisions `unit_price numeric(12,2)`, `subtotal numeric(22,2)`, `total_amount numeric(24,2)`.
- [x] Implement `down` in reverse dependency order. Keep existing employee/catalog migrations unchanged.

## Task 3: Implement supplier management

**Files:**
- Create: `backend/src/suppliers/dto/create-supplier.dto.ts`
- Create: `backend/src/suppliers/dto/update-supplier.dto.ts`
- Create: `backend/src/suppliers/suppliers.controller.ts`
- Create: `backend/src/suppliers/suppliers.service.ts`
- Create: `backend/src/suppliers/suppliers.module.ts`

- [x] Add DTO validation with required `name` on create; make every field optional on the `PATCH` DTO while validating any supplied `name`, address, or email.
- [x] Add JWT-protected list, detail, create, update, and delete routes.
- [x] Return not-found for unknown IDs and conflict when a supplier is referenced by an import.
- [x] Register `Supplier` through `TypeOrmModule.forFeature` and export the module only if another domain needs it.

## Task 4: Implement opening balances and stock adjustments

**Files:**
- Create: `backend/src/inventory/dto/create-opening-balances.dto.ts`
- Create: `backend/src/inventory/dto/create-stock-adjustment.dto.ts`
- Create: `backend/src/inventory/dto/get-stock-balance.dto.ts`
- Create: `backend/src/inventory/inventory.controller.ts`
- Create: `backend/src/inventory/inventory.service.ts`
- Create: `backend/src/inventory/inventory.module.ts`

- [x] Add `POST /inventory/opening-balances` for an atomic batch of nonnegative initial quantities. Lock variant rows in ascending ID order; reject a variant with any existing movement and permit one opening row, including zero.
- [x] Add `POST /inventory/adjustments` with direction, positive integer quantity, and required note. In a transaction, lock the variant, calculate current balance, and reject an outbound correction that would make stock negative.
- [x] Add `GET /inventory/variants/:variantId/balance?from=YYYY-MM-DD&to=YYYY-MM-DD`. Interpret day boundaries as UTC midnight; return beginning balance, period inbound, period outbound, and ending balance. Require `from < to` and return quantities as decimal strings if needed to avoid JSON integer precision loss.
- [x] Attribute every movement to the employee ID from `AuthenticatedRequest`; protect the controller with `EmployeeJwtGuard`.

## Task 5: Implement atomic supplier imports

**Files:**
- Create: `backend/src/imports/dto/create-import.dto.ts`
- Create: `backend/src/imports/imports.controller.ts`
- Create: `backend/src/imports/imports.service.ts`
- Create: `backend/src/imports/imports.module.ts`
- Modify: `backend/src/inventory/inventory.module.ts` and `backend/src/inventory/inventory.service.ts` to expose a transaction-manager-aware import movement helper.

- [x] Validate supplier ID, optional note, 1–100 detail lines, distinct variant IDs, positive integer quantities, and nonnegative unit prices with at most two decimal places.
- [x] Implement `GET /imports`, `GET /imports/:importId`, and `POST /imports`; all routes require the employee JWT.
- [x] In one `DataSource.transaction`, lock and validate supplier and variant rows (variant locks sorted by ascending ID), compute line subtotals and header total using integer cents/`BigInt`, save header and details, and write one inbound movement per detail through the same transaction manager.
- [x] Reject editing or deleting imports; map unknown supplier/variant IDs and constraint violations to clear client errors with no partial writes.
- [x] Register the import/supplier/ledger entities in their feature modules and ensure the import module can call the exported ledger helper.

## Task 6: Register modules and document the API

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `backend/README.md`

- [x] Register `SuppliersModule`, `ImportsModule`, and `InventoryModule` without duplicating `AuthModule` providers.
- [x] Document migration commands and the new supplier/import/inventory routes, UTC report range rules, and initial-opening workflow.
- [x] Explain that pending/canceled orders do not affect stock and future order fulfillment will add outbound ledger rows.

## Task 7: Verify, migrate, and publish

**Files:** none beyond the files above.

- [x] Run `npm run format`, `npm run build`, and `npm run lint` from `backend/`.
- [x] Run `git diff --check` and inspect the final diff, especially migration constraints and money arithmetic.
- [x] Apply the new migration to the configured local PostgreSQL database with `npm run db:migrate`; confirm all migrations show applied with `npm run db:migrations`. Do not print or commit `.env` contents.
- [ ] Commit the ERD, migration, APIs, and docs; push to the repository's `main` branch and confirm the remote commit hash.

No tests are added or run in this plan.
