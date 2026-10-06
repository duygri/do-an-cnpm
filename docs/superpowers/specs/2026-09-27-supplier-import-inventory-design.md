> **Superseded for inventory behavior (2026-09-29).** This is a historical design record; the current decision is [Remove Inventory Tracking Design](2026-09-29-remove-inventory-design.md). The ledger, opening-balance and adjustment APIs, balance calculations, import-to-ledger writes, and all other inventory-movement behavior described below are no longer current. Keep the supplier/import APIs, document lines and server-side purchase totals: import quantities remain purchase-document history only and do not create or update an available-stock balance.

# Supplier, imports, and inventory design

## Goal

Continue the NestJS/PostgreSQL backend with supplier management, purchase imports, and auditable stock balances that follow `ending = beginning + inbound - outbound`.

## Scope

- Add protected supplier CRUD and purchase-import create/list/detail APIs.
- Record opening balances, imports, later sales, and stock-count corrections in an inventory movement ledger.
- Make import creation and its stock movements atomic.
- Correct the ERD's missing/ambiguous keys and optional one-to-one relationships.
- Sales/order APIs were a later phase at the time of this design. Its planned fulfillment-time stock deduction rule is historical and superseded by the approved [customer order placement design](2026-09-28-customer-order-placement-design.md), which writes the outbound sale movement at order placement and a compensating inbound movement when a pending order is cancelled.

## Data model

- `supplier`: generated ID, required name, optional address and email.
- `stock_import`: generated ID, timestamp, computed total, optional note, required supplier and employee.
- `import_detail`: composite primary key `(import_id, variant_id)`, positive quantity, nonnegative unit price, computed subtotal. A variant may appear once per import.
- `inventory_movement`: the original supplier/import phase defined variant, direction (`in`/`out`), kind (`opening`/`import`/`sale`/`adjustment`), quantity, effective timestamp, employee actor, optional source document, and optional note. The approved [customer order placement design](2026-09-28-customer-order-placement-design.md) extends that model with customer-attributed order sales, a `sale_cancellation` kind, and an `(order_id, variant_id)` link to `order_detail`; employees remain actors for opening, import, and adjustment movements. The old fulfillment-time deduction policy is historical and superseded: sales now write outbound movements at order placement, and pending cancellation appends a customer-attributed inbound movement. Opening and imports are inbound; adjustments can be inbound or outbound. Opening quantity may be zero; all other movements require a positive integer quantity. There can be one opening movement per variant, and it can only be recorded before any other movement for that variant. Import movements reference their `(import_id, variant_id)` detail pair with a database foreign key and a unique constraint.

Inventory movement and its source document are written in the same database transaction. Import totals and line subtotals are computed by the server from integer quantities and decimal money values, never accepted from the client. Quantities use positive PostgreSQL `integer` values (opening may be zero); unit prices use `numeric(12,2)`, line subtotals use `numeric(22,2)`, and import totals use `numeric(24,2)`. Those total columns accommodate the maximum integer quantity, unit price, and 100 accepted detail rows. Foreign keys restrict deletion of suppliers, variants, employees, imports, and other records already used by history. A period's beginning balance is the net of movements before its start; inbound and outbound movements in the period supply the `+ nhập - xuất` terms. No separate mutable stock total is maintained.

## ERD corrections

- Add the missing inventory movement entity and its relationship to product variants and employees.
- Mark `(order_id, variant_id)` as the composite primary key of `Order_Detail`; mark `(import_id, variant_id)` as the composite primary key of `Import_Detail`.
- Make `Packing.order_id` and `Invoice.order_id` unique. An order may have zero or one packing record and zero or one invoice while it is being processed; each such record belongs to exactly one order.
- Keep invoice `total_amount` as the amount snapshot at issue time. Remove the duplicate invoice `method` field; payment method/status remain on the order for this phase.
- Email addresses used to sign in or identify customers/employees should be unique. This is a database constraint, not an additional API feature in this phase.
- Add a unique constraint to `Promotion_Detail.code` so a voucher code cannot identify multiple vouchers.
- Keep the supplied PNG as the original; add `docs/erd/sales-system-erd.md` as the corrected, renderable Mermaid ERD source.

## API and access

Supplier and import endpoints require an active employee JWT with role `manager` or `admin`. Other role mappings and the `401`/`403` distinction are defined in the [current role design](2026-10-06-admin-manager-roles-design.md). The inventory endpoints described historically in this document have since been removed by the approved no-inventory decision.

- `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:supplierId`
- `GET /imports`, `GET /imports/:importId`, `POST /imports`
- `POST /inventory/opening-balances`: accepts one or more `{variantId, quantity}` rows and records the initial balance. A batch succeeds wholly or not at all; variants with an existing movement cannot receive an opening balance.
- `POST /inventory/adjustments`: records an employee-attributed inbound or outbound stock-count correction with a required note; an outbound adjustment cannot make stock negative.
- `GET /inventory/variants/:variantId/balance?from=<ISO-date>&to=<ISO-date>`: returns beginning balance, inbound total, outbound total, and ending balance. Date-only values are interpreted at UTC midnight; `from` is inclusive and `to` is exclusive. Both are required and `from` must be before `to`.
- Import creation accepts supplier ID, optional note, and 1–100 detail rows (`variantId`, positive `quantity`, nonnegative `unitPrice`). It derives the employee from the JWT. Imports are historical documents and cannot be edited or deleted through this API.

Supplier deletion is rejected if an import references it. Invalid suppliers/variants, duplicate variants within one import, malformed amounts, and database constraint conflicts return client errors without partially saving an import or stock movement.

## Out of scope

Customer/order/payment/packing/invoice APIs, public product browsing, product images, and live stock reservation are later phases. At the time of this phase, it did not deduct stock for an order because fulfillment was not implemented yet.

## Acceptance criteria

- Supplier, import, and inventory tables match the documented keys and foreign keys; the corrected Mermaid ERD is committed.
- Creating an import saves its header, details, and inbound inventory movements together or saves none of them.
- Opening balances, import movements, and stock-count adjustments are auditable and transactionally consistent.
- Period balance API returns opening quantity plus inbound movements minus outbound movements.
- Supplier/import routes require role `manager` or `admin` and are documented in the backend README; the historical inventory routes are removed by the no-inventory decision.
- Existing migrations and records remain intact; schema changes use a new reversible migration.
