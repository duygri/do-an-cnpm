# Admin Order Processing Design

## Goal

Let authenticated employees review customer orders and pack an order in one direct action, while preserving the existing stock ledger and customer cancellation rules.

## Scope

- Add employee-authenticated, paginated order listing and order detail endpoints.
- Add a direct `pending` to `packed` transition that creates one packing record.
- Track server time, the employee who packed the order, an optional packaging type, an optional note, and packing status.
- Add a reversible migration for the packing table and the additional sales-order status.
- Update the corrected ERD and backend README.

This MVP has no separate `confirmed` or `packing` stage. It does not implement shipment tracking, delivery completion, payment, employee cancellation/refunds, package weight, or a packing fee.

## API and access

All routes require the existing `EmployeeJwtGuard`, which authenticates an active employee. The current employee model has no role/permission system, so these routes follow the same employee access policy as the existing catalog, supplier, import, and inventory APIs. Do not return the customer entity or password hash.

- `GET /admin/orders?page=1&limit=20&status=pending`: list orders newest first by `(orderDate DESC, orderId DESC)`; `status` is optional and accepts only `pending`, `packed`, or `cancelled`. Pagination defaults to page 1 and limit 20; `page` must be an integer from 1 through 2,147,483,647, and `limit` an integer from 1 through 100. A valid page beyond the final page returns an empty `items` array with the actual `total`, not a 404. Return `{ items, page, limit, total }`. Each item has exactly `orderId`, `orderDate`, `customerId`, `recipientName`, `status`, `paymentStatus`, `totalAmount`, and `detailCount`. Do not include delivery address or order lines in the list.
- `GET /admin/orders/:orderId`: return `{ orderId, orderDate, customerId, recipientName, recipientPhone, shippingAddress, discountAmount, shippingFee, totalAmount, paymentMethod, paymentStatus, status, note, details, packing }`. `details` is sorted by `variantId`; each detail has exactly `orderId`, `variantId`, `productName`, `size`, `color`, `quantity`, `unitPrice`, and `subtotal`. `packing` is null or `{ packingId, packingDate, packingType, status, note, employeeId }`. Select only these fields; never serialize the full customer entity.
- `POST /admin/orders/:orderId/pack`: accept optional `packingType` (`bag` or `box`) and optional `note`. Neither employee ID, timestamp, packing status, nor sales-order status is client-controlled. Return the same order shape as the detail endpoint with its new packing record.

Malformed or out-of-range order IDs return `404 Not Found`. Non-integer or out-of-range `page`/`limit`, unsupported status values, unknown body fields, unsupported `packingType` values, non-string notes, and notes longer than 1000 characters return `400 Bad Request`. Optional strings are trimmed; an empty note is stored as null.

For all responses, IDs, quantities, counts, `page`, and `limit` are JSON integers; monetary values are decimal strings with exactly two fractional digits; and timestamp values are ISO 8601 UTC strings. Optional `note`, `packingType`, and `packing` values serialize as JSON `null` when absent.

## Order and packing behavior

The only employee transition in this phase is `pending` to `packed`. A cancelled or already-packed order returns `409 Conflict`; an unknown order returns `404 Not Found`.

Packing runs in one database transaction:

1. Lock the target sales-order row with a pessimistic write lock.
2. Confirm the order is still `pending`.
3. Insert its unique packing row, deriving `employee_id` from the authenticated request and the packing timestamp from the server/database. Store the optional type and note; set packing status to `packed`.
4. Change the sales-order status to `packed`.
5. Reload and return the updated order before committing.

The customer cancellation path already locks the same sales-order row before checking `pending`. Therefore packing and cancellation serialize: whichever transaction commits first determines whether the other action is rejected. Packing does not write inventory movements or change stock; stock was deducted at order placement. Once packed, the customer can no longer cancel through the current pending-only cancellation endpoint.

## Data model and migration

Add `packing` with a generated integer `packing_id` primary key (matching the approved ERD), server timestamp `packing_date`, nullable `packing_type` restricted to `bag` or `box`, `status` restricted to `packed`, nullable text `note`, required employee FK, and a required unique order FK. Both FKs use restrictive delete behavior. The unique `order_id` enforces at most one packing record per order.

Extend `sales_order.status` validation to allow `pending`, `packed`, and `cancelled`. Add the composite index `(status, order_date)` for filtered staff history; retain the existing order-date index for unfiltered history. Add TypeORM relations without eager-loading customer secrets. The `packing` record has no weight or packing-fee columns; `sales_order.shipping_fee` remains the separate delivery charge.

The migration's `up` and `down` paths require an active transaction. Assert `queryRunner.isTransactionActive` before any database work and do not set a per-migration `transaction` override: the repository's TypeORM commands use the default `all` transaction mode, which rejects migration-level overrides. Rollback is reversible when no order is currently `packed`. Its `down` path must acquire `ACCESS EXCLUSIVE` locks on `sales_order` then `packing` (matching the application lock order) to block pack/cancel writes, and only then query for packed orders and packing rows. If either count is nonzero, fail with a clear message before executing any destructive DDL. It must not silently delete packing history or convert a packed order back into a cancellable state. Run rollback only after packed orders have been handled explicitly.

## Errors and concurrency

- Packing a cancelled or already-packed order returns `409` and creates no packing row.
- A missing order returns `404` and creates no row.
- Concurrent pack/cancel requests are serialized on the sales-order row; no order can become both packed and cancelled.
- A unique order constraint and the status check remain database protections against duplicate packing and invalid states.

## Out of scope

- Role-based employee authorization beyond the existing active-employee guard.
- Customer-facing shipment/delivery milestones, tracking numbers, carrier integration, weight-based shipping, and shipping-fee calculation.
- Payment settlement, invoice issuance, vouchers/promotions, employee cancellation/refund, order edits, and inventory changes during packing.
- Automated test additions or execution.

## Acceptance criteria

- Employee JWT is required for list, detail, and pack endpoints.
- Employee list is paginated and optionally filterable by a valid order status without joining detail rows into pagination.
- Employee detail contains the delivery snapshot and packing-relevant product/variant data but does not leak `customer.password_hash`.
- A valid pack request atomically creates one packing record and changes `pending` to `packed`, using the authenticated employee and server time.
- Duplicate packing, cancelled orders, missing orders, and concurrent customer cancellation cannot create inconsistent packing/order state.
- Customer cancellation remains restricted to pending orders and retains its stock-restoration transaction behavior.
- Migration constraints, entity definitions, ERD, and README agree; the migration can safely refuse rollback when packed orders exist.
- Backend format, build, and lint pass; all migrations show applied after running the new migration in the authorized local development database.
