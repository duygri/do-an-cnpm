# Supplier, imports, and inventory design

## Goal

Continue the NestJS/PostgreSQL backend with supplier management, purchase imports, and auditable stock balances that follow `ending = beginning + inbound - outbound`.

## Scope

- Add protected supplier CRUD and purchase-import create/list/detail APIs.
- Record opening balances, imports, later sales, and stock-count corrections in an inventory movement ledger.
- Make import creation and its stock movements atomic.
- Correct the ERD's missing/ambiguous keys and optional one-to-one relationships.
- Sales/order APIs are a later phase; the ledger supports outbound sale movements, which will be written when an order is actually fulfilled. Draft, pending, or canceled orders do not reduce stock.

## Data model

- `supplier`: generated ID, required name, optional address and email.
- `stock_import`: generated ID, timestamp, computed total, optional note, required supplier and employee.
- `import_detail`: composite primary key `(import_id, variant_id)`, positive quantity, nonnegative unit price, computed subtotal. A variant may appear once per import.
- `inventory_movement`: variant, direction (`in`/`out`), movement kind (`opening`/`import`/`sale`/`adjustment`), positive quantity, effective timestamp, employee, an optional source-document relation, and optional note. Opening balance is an inbound movement; imports are inbound; fulfilled sales are outbound. Positive adjustments are inbound and negative stock-count corrections are outbound. This preserves the requested period formula while retaining who changed stock and when. Import movements reference their `(import_id, variant_id)` detail pair with a database foreign key and a unique constraint. The later order migration will add the matching `(order_id, variant_id)` source relation for sale movements.

Inventory movement and its source document are written in the same database transaction. Import totals and line subtotals are computed by the server from integer quantities and decimal money values, never accepted from the client. Foreign keys restrict deletion of suppliers, variants, employees, imports, and other records already used by history. A period's beginning balance is the net of movements before its start; inbound and outbound movements in the period supply the `+ nhập - xuất` terms. No separate mutable stock total is maintained.

## ERD corrections

- Add the missing inventory movement entity and its relationship to product variants and employees.
- Mark `(order_id, variant_id)` as the composite primary key of `Order_Detail`; mark `(import_id, variant_id)` as the composite primary key of `Import_Detail`.
- Make `Packing.order_id` and `Invoice.order_id` unique. An order may have zero or one packing record and zero or one invoice while it is being processed; each such record belongs to exactly one order.
- Keep invoice `total_amount` as the amount snapshot at issue time. Payment method/status remain on the order for this phase; avoid a second payment-method field on the invoice.
- Email addresses used to sign in or identify customers/employees should be unique. This is a database constraint, not an additional API feature in this phase.

## API and access

All endpoints require an employee JWT, consistent with the existing admin catalog API.

- `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:supplierId`
- `GET /imports`, `GET /imports/:importId`, `POST /imports`
- Import creation accepts supplier ID, optional note, and 1–100 detail rows (`variantId`, positive `quantity`, nonnegative `unitPrice`). It derives the employee from the JWT. Imports are historical documents and cannot be edited or deleted through this API.

Supplier deletion is rejected if an import references it. Invalid suppliers/variants, duplicate variants within one import, malformed amounts, and database constraint conflicts return client errors without partially saving an import or stock movement.

## Out of scope

Customer/order/payment/packing/invoice APIs, public product browsing, product images, and live stock reservation are later phases. This phase does not deduct stock for an order because order fulfillment is not implemented yet.

## Acceptance criteria

- Supplier and import tables match the documented keys and foreign keys.
- Creating an import saves its header, details, and inbound inventory movements together or saves none of them.
- Inventory balances for a period can be derived as opening quantity plus inbound movements minus outbound movements.
- Supplier/import routes require an employee JWT and are documented in the backend README.
- Existing migrations and records remain intact; schema changes use a new reversible migration.
