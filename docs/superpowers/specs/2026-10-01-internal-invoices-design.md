# Internal MVP payment receipt records

## Goal

Create one internal MVP payment receipt record (`biên nhận thanh toán nội bộ MVP`) for each order after the order is confirmed paid. The database table and entity remain named `invoice` for compatibility. This backend record and receipt summary is not an electronic invoice or a legally compliant tax invoice, and is not an external invoicing integration.

## Behavior

- Create the internal receipt row in the same database transaction as payment confirmation.
- For COD, create it when an employee marks a packed COD order as paid.
- For PayOS, create it only from the shared full-payment settlement transaction after provider reconciliation confirms full payment. This covers webhook, scheduled reconciliation, retry, cancellation lookup, and any link-creation path that confirms payment.
- For a PayOS order with a zero total, create it in the same transaction that creates the locally paid order.
- An unpaid, cancelled, or unconfirmed order has no receipt row.
- Enforce at most one `invoice` row per order. Keep the order total as a snapshot at issue time.
- Backfill receipt rows for orders already marked paid when the migration runs, using their recorded payment confirmation timestamp.
- Expose a read-only receipt summary to the owning customer and to active employees with role `order_staff` or `admin` on the admin route. No frontend, manual issue action, tax fields, refund, or cancellation flow is included.

## Data model

The existing `invoice` table/entity contains generated `invoice_id`, database-issued `issued_date`, nonnegative `total_amount`, `status` (`issued`), and unique required `order_id`. These columns and their meanings remain unchanged. The foreign key restricts deleting an order referenced by an invoice. A migration rollback must refuse to discard any issued receipt rows. The row is an internal MVP payment receipt, not an electronic invoice or a legally compliant tax invoice.

## API

- `GET /orders/:orderId/invoice`: customer JWT; only returns the authenticated customer's receipt summary.
- `GET /admin/orders/:orderId/invoice`: active employee JWT with role `order_staff` or `admin`; an active employee without the role receives `403 Forbidden`. See the [employee role authorization matrix](2026-10-01-employee-role-authorization-design.md).
- Keep both `/invoice` route paths and all response field names unchanged. Both return `invoiceId`, `orderId`, `issuedDate`, `totalAmount`, and `status`. If no receipt row exists or the order is outside the caller's access, return `404`.

## Transaction boundaries

The `invoice` row insert and the paid-state transition share a transaction. The unique database constraint is the final duplicate-prevention guarantee; receipt creation is idempotent if the same paid order is reconciled more than once.
