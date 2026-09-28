# Customer Order Placement Design

## Goal

Allow an authenticated customer to place and manage their own sales orders while keeping stock balances correct and auditable.

## Inventory policy revision

This approved order phase supersedes the fulfillment-time stock deduction rule in 2026-09-27-supplier-import-inventory-design.md. A pending order now writes its outbound sale movements immediately and reduces available stock; cancelling a pending order restores stock with sale_cancellation inbound movements. Update the corrected ERD and backend README to show this timing consistently.
## Scope

- Add customer-authenticated order creation, order listing/detail, and cancellation while an order is pending.
- Deduct stock at order placement by writing outbound sale movements atomically with the order.
- Restore stock on customer cancellation by writing compensating inbound movements; never edit or delete the original sale movement.
- Extend the existing inventory ledger so customer actions are attributable and order lines are valid movement sources.
- Add an order migration and update the corrected ERD and backend documentation.

This phase does not implement employee order processing/fulfillment, payment processing, vouchers/promotions, shipping-fee calculation, packing, or invoices.

## API and access

All routes below require a customer JWT via the existing `CustomerJwtGuard`. A customer can only list, inspect, or cancel their own orders.

- `POST /orders`: accept 1–100 distinct variant lines with positive integer quantities and required delivery snapshot fields `recipientName`, `recipientPhone`, and `shippingAddress`; accept an optional `note`.
- `GET /orders?page=1&limit=20`: list the caller's orders newest first, paginated with defaults 1/20 and maximum limit 100.
- `GET /orders/:orderId`: return one order and its lines only if it belongs to the caller.
- `POST /orders/:orderId/cancel`: cancel the caller's pending order. Repeated cancellation or cancellation after the pending state returns a conflict.

Names are trimmed and must fit the existing customer name length (120); phone is trimmed and must fit 30 characters; shipping address is trimmed and must be non-empty. The customer supplies these values for each order so later profile changes do not rewrite the delivery details of an existing order. Duplicate variant IDs in one request are rejected.

Unknown, inactive, or insufficient-stock variants reject the whole request. Unknown or another customer's order returns not found to avoid exposing order IDs.

## Order and inventory behavior

Order creation runs in one database transaction:

1. Sort variant IDs and lock their rows in ascending order, using the same row lock used by imports and inventory adjustments.
2. Confirm every variant exists and its parent product is active.
3. Compute each current stock balance from ledger movements and reject if any requested quantity exceeds available stock.
4. Snapshot each variant's current unit price and calculate line subtotals and total using integer cents/BigInt. Prices and totals are always computed by the server.
5. Save the order, its details, and one outbound `sale` inventory movement per detail with the customer as actor.

No writes survive if any line is invalid or out of stock. Row locks serialize simultaneous order submissions and other stock changes for the same variants.

New orders have status `pending`, payment status `unpaid`, and null payment method, with zero discount and zero shipping fee. Do not add a voucher column or FK until the promotion schema is implemented. The total equals the sum of the saved line subtotals. These fields are server-owned; clients cannot submit totals, prices, discounts, payment status, or shipping fees.

Cancellation also runs in one transaction. Lock the order, confirm ownership and `pending` status, then lock its variant rows in ascending ID order. Add one inbound `sale_cancellation` movement per order detail, attributed to the customer, and change the order status to `cancelled`. Keep the original sale movements and the order details unchanged. A unique order/variant constraint per movement kind prevents duplicate sale or cancellation ledger rows.

This phase has no transition from pending to fulfilled; an employee order workflow will be designed later. Payment status remains unpaid until a later payment phase.

## Data model and migration

Add `sales_order` with generated integer ID, server timestamp, customer FK, delivery snapshot (`recipient_name`, `recipient_phone`, `shipping_address`), nonnegative `discount_amount`, `shipping_fee`, and `total_amount`, nullable payment method, `payment_status`, `status`, and optional note. Use `numeric(24,2)` for header money fields.

Add `order_detail` with composite primary key `(order_id, variant_id)`, positive integer quantity, nonnegative `numeric(12,2)` unit-price snapshot, and nonnegative `numeric(22,2)` computed subtotal. Restrict deletion of customers, variants, and referenced order history.

Extend `inventory_movement` in a new reversible migration:

- Add nullable `customer_id` and `order_id`; make `employee_id` nullable while retaining existing employee attribution.
- Require exactly one of employee/customer as actor. Opening, import, and adjustment movements require an employee; sale and sale-cancellation movements require a customer.
- Add a composite FK `(order_id, variant_id)` to `order_detail(order_id, variant_id)`.
- Allow kinds `opening`, `import`, `sale`, `sale_cancellation`, and `adjustment`; constrain opening/import/sale-cancellation to inbound and sale to outbound, while adjustments may be either direction.
- Enforce that import movements reference only import details, sale and sale-cancellation movements reference only order details, and opening/adjustment movements have no source document.
- Add partial unique indexes for one sale movement and at most one sale-cancellation movement per order detail, while preserving the existing import movement uniqueness.

Existing inventory movements remain valid with their employee actor and import source; migration rollback removes order-linked movement rows, drops new constraints and order references, restores the employee actor requirement and previous checks, then drops the order tables. Order data created by this feature is removed by rollback.

## Errors

- Invalid line counts, duplicate variants, invalid quantities, empty recipient fields, or insufficient stock return a client error without partial writes.
- Missing/inactive variants produce a client error identifying the unavailable item.
- Unknown or non-pending customer-owned cancellation targets produce not-found or conflict responses as specified above.
- Database constraints remain the final protection against negative quantities, invalid source links, duplicate source movements, and negative money values.

## Out of scope

- Employee/admin order lists, fulfillment, packing, invoices, customer payment, refunds, voucher validation, shipping calculations, order edits, and customer-visible stock quantities.
- A separate stock reservation table; stock is decremented immediately when an order is placed.
- Automated test additions or execution.

## Acceptance criteria

- Customer JWT is required for all order routes, and order reads/cancellations are scoped to the authenticated customer.
- A valid order snapshots delivery information and current prices, computes totals server-side, and writes order, details, and outbound movements atomically.
- Concurrent orders for the same variants cannot make stock negative.
- A pending order cancellation changes the status and writes compensating inbound movements atomically without modifying prior ledger rows.
- Duplicate cancellation, invalid items, and out-of-stock requests cannot create duplicate or partial order/movement records.
- The migration is reversible and preserves existing import/opening/adjustment ledger behavior.
- The corrected ERD and backend README document the order API, order states, stock deduction and cancellation rules.



