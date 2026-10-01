> **Historical phase design, aligned with the approved current policy.** An earlier draft proposed checking stock and writing inventory movements during order placement/cancellation; that proposal was superseded by [Remove Inventory Tracking Design](2026-09-29-remove-inventory-design.md) and is not current behavior. The system does not track stock. Follow-on payment, voucher, invoice, and employee-packing behavior is specified separately and is not redefined here.

# Customer Order Placement Design

## Goal

Allow an authenticated customer to place, inspect, list, and cancel their own orders while preserving the purchase-time product and variant identity on each order line.

## Current inventory policy

- The system does not track stock balances, inventory movements, reservations, or available quantities.
- `IMPORT_DETAIL.quantity` and `ORDER_DETAIL.quantity` are values recorded on purchase and order documents. Import quantities do not replenish a computed balance, and order quantities are not compared with available stock.
- Order placement does not reserve or deduct stock. A permitted cancellation changes the order state only; it does not restore or otherwise mutate stock.
- Supplier, import, and import-detail records remain as purchase history.

## Scope

- Require customer authentication and ownership checks for order list, detail, and cancellation.
- Validate active products and valid variants; calculate and persist order line prices and totals on the server.
- Resolve product name, variant size, and variant color from the current catalog when returning full order details; edits to the catalog can change how older orders are displayed.
- Keep pending-only customer cancellation, coordinated with employee packing through the sales-order row lock.

This is the historical customer-order placement design; later documents define payment providers, vouchers, internal MVP receipts, and employee packing. Their behavior does not add inventory tracking.

## API and access

All routes require a customer JWT via the existing `CustomerJwtGuard`. A customer can only list, inspect, or cancel their own orders.

- `POST /orders`: accept 1–100 distinct variant lines with positive integer quantities and required delivery snapshot fields `recipientName`, `recipientPhone`, and `shippingAddress`; accept optional `note`, `voucherCode`, and `paymentMethod` as described in the current backend API documentation. Its full-order response includes details with `orderId`, `variantId`, `productName`, `size`, `color`, `quantity`, `unitPrice`, and `subtotal`.
- `GET /orders?page=1&limit=20`: list the caller’s orders newest first, paginated with defaults 1/20 and maximum limit 100. This remains a summary response without order-line details.
- `GET /orders/:orderId`: return one order and its lines only if it belongs to the caller. Each detail includes `orderId`, `variantId`, `productName`, `size`, `color`, `quantity`, `unitPrice`, and `subtotal`; product and variant descriptions come from the current catalog.
- `POST /orders/:orderId/cancel`: cancel the caller’s pending order when permitted by its payment state. Return the updated full order and details using current catalog values.

Names are trimmed and must fit the existing customer name length (120); phone is trimmed and must fit 30 characters; shipping address is trimmed and must be non-empty. These recipient values are stored with the order so later profile changes do not rewrite its delivery details. Duplicate variant IDs in one request are rejected.

The customer ID comes from the JWT. The server owns all prices, discounts, shipping fees, totals, payment status, and order status; clients cannot provide these fields. `paymentMethod` defaults to COD and may be PayOS. New orders start `pending`; COD starts `unpaid`. A zero-total PayOS order is marked paid locally without creating a provider attempt, while a positive-total PayOS order starts unpaid and creates its payment attempt atomically. Voucher application and payment-specific checks are defined in their follow-on designs and the current backend API documentation.

Unknown, inactive, or invalid variants reject the whole request. Quantities are not checked against a stock balance because none is maintained. An unknown order or another customer’s order returns not found to avoid exposing order IDs.

## Order behavior

Order creation runs in one database transaction:

1. Load the requested variants and their products, then confirm that every variant exists and each parent product is active.
2. Read the product name, variant size, variant color, and current unit price for each line.
3. Calculate line subtotals and the merchandise total from server-calculated prices using integer cents/BigInt; all client-supplied money values are ignored or rejected by the request contract.
4. Save the order and its details before the transaction commits. The order detail stores its variant ID and the price charged at purchase.

If a line is invalid, no order or order-detail writes survive. When the request uses a positive-total PayOS payment, its payment attempt is also created in the order transaction. Payment settlement and voucher-use rules remain governed by their respective follow-on designs.

Full customer and admin order detail responses resolve product name, size, and color from the current product and variant rows. These descriptive values may change for older orders after catalog edits; the charged unit price remains stored on the order line.

Order line quantities are document data only. Order creation does not acquire variant locks to coordinate stock, inspect a stock balance, reserve units, or write inventory movements. If any line is invalid, the transaction writes no partial order or details.

Cancellation runs in a transaction, locks the order, verifies ownership and `pending` state, then updates the order state to `cancelled` when allowed by the payment workflow. For PayOS, a saved link must be confirmed terminal and unpaid before cancellation; uncertain state, partial payment, or a link that cannot be reconciled keeps the order pending and its voucher use for review. Packing and cancellation lock the same order row, so only one state transition can win. A successful cancellation changes the order status, which releases voucher use under its policy; it does not write inventory movements or change stock.

## Data model and migration

`sales_order` has a generated integer ID, server timestamp, customer FK, delivery snapshot (`recipient_name`, `recipient_phone`, `shipping_address`), nonnegative `discount_amount`, `shipping_fee`, and `total_amount`, nullable payment method for legacy rows, `payment_status`, `status`, and optional note. Header money fields use `numeric(24,2)`.

`order_detail` uses composite primary key `(order_id, variant_id)`, positive integer quantity, nonnegative `numeric(12,2)` unit-price snapshot, nonnegative `numeric(22,2)` computed subtotal, and restrictive foreign keys to the order and variant. Product name, size, and color are resolved from the current catalog and are not stored on the order line.

No order-placement migration creates or modifies a stock ledger or balance. Import and order quantities remain document values only.

## Errors

- Invalid line counts, duplicate variants, invalid quantities, or empty recipient fields return a client error without partial writes.
- Missing or inactive variants produce a client error identifying the unavailable item; the API does not return an out-of-stock error.
- Unknown or non-pending customer-owned cancellation targets produce not-found or conflict responses as specified above.
- Database constraints remain the final protection against invalid references, duplicate order lines, nonpositive quantities, and invalid money values.

## Out of scope

- Employee order lists, packing implementation, detailed payment-provider behavior, voucher rules, receipt issuance, refunds, shipping-fee calculation, and order edits are defined in their follow-on designs.
- Stock tracking, stock reservations, stock deduction/restoration, inventory movement rows, and customer-visible available-stock quantities are not part of this system’s approved behavior.
- Frontend implementation.

## Acceptance criteria

- Customer JWT is required for customer order routes, and order reads/cancellations are scoped to the authenticated customer.
- A valid order stores recipient details and charged unit prices, computes totals server-side, and saves order and lines atomically.
- Customer create/detail/cancel responses expose line fields `productName`, `size`, and `color` from the current catalog; `GET /orders` remains a summary.
- Catalog edits can alter the displayed product name, size, or color on older orders.
- Order placement does not reserve or deduct stock; import/order quantities remain document data; cancellation changes order state only.
- Duplicate cancellation, invalid items, and invalid requests cannot create partial order records.
