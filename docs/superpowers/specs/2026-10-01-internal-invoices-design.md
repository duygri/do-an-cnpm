# Internal invoice records

## Goal

Create one internal invoice record for each order after the order is confirmed paid. This is a backend record and receipt summary, not an electronic tax invoice or an external invoicing integration.

## Behavior

- Issue the invoice in the same database transaction as the payment confirmation.
- For COD, issue it when an employee marks a packed COD order as paid.
- For PayOS, issue it only from the shared full-payment settlement transaction after provider reconciliation confirms the full payment. This covers webhook, scheduled reconciliation, retry, cancellation lookup, and any link-creation path that confirms payment.
- For a PayOS order with a zero total, issue it in the same transaction that creates the locally paid order.
- An unpaid, cancelled, or unconfirmed order has no invoice.
- Enforce at most one invoice per order. Keep the order total as a snapshot at issue time.
- Backfill invoices for orders already marked paid when the migration runs, using their recorded payment confirmation timestamp.
- Expose a read-only invoice summary to the owning customer and to authenticated employees. No frontend, manual issue action, tax fields, refund, or invoice cancellation flow is included.

## Data model

`invoice` contains generated `invoice_id`, database-issued `issued_date`, nonnegative `total_amount`, `status` (`issued`), and unique required `order_id`. The foreign key restricts deleting an order referenced by an invoice. A migration rollback must refuse to discard any issued invoice rows.

## API

- `GET /orders/:orderId/invoice`: customer JWT; only returns the authenticated customer's invoice.
- `GET /admin/orders/:orderId/invoice`: active employee JWT.
- Both return `invoiceId`, `orderId`, `issuedDate`, `totalAmount`, and `status`. If an invoice is not issued or is outside the caller's access, return `404`.

## Transaction boundaries

The invoice insert and the paid-state transition share a transaction. The unique database constraint is the final duplicate-prevention guarantee; invoice creation is idempotent if the same paid order is reconciled more than once.
