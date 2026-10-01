# COD Payment Design

## Goal

Record cash-on-delivery payment for customer orders in the backend. COD is the only supported payment method in this MVP; additional methods can be added in a later phase.

## Scope

- Set every newly created order to `paymentMethod: "cod"` and `paymentStatus: "unpaid"` on the server. The customer request cannot choose or set payment fields.
- Let an active employee with role `order_staff` or `admin` record that the full COD amount was received after the order is packed.
- Store the server confirmation time and the employee who confirmed receipt.
- Keep the order's fulfillment status `packed` when payment is recorded.
- Preserve legacy rows whose payment method is `null`; do not infer how historical orders were paid.
- Update the corrected ERD and backend documentation. Do not change frontend files.

This does not implement online payment, partial payment, refunds, invoices, delivery tracking, or shipping-charge calculation. It does not automatically mark an order paid when it is packed.

## API and access

Add `POST /admin/orders/:orderId/mark-paid`. It requires the employee authentication and role guards, with role `order_staff` or `admin`, and accepts no body. An authenticated employee without either role receives `403 Forbidden`; authentication failures receive `401 Unauthorized`. The role mapping is defined in the [employee role authorization matrix](2026-10-01-employee-role-authorization-design.md). The employee ID comes from the authenticated request; the confirmation timestamp comes from PostgreSQL. It returns the updated admin order detail with `paymentMethod`, `paymentStatus`, `paymentConfirmedAt`, and `paymentConfirmedByEmployeeId`.

The endpoint returns `404 Not Found` for an invalid or unknown order ID. It returns `409 Conflict` when the order is not packed, the method is not COD, or payment was already confirmed. `packed` only makes the order eligible for confirmation; an employee must call the endpoint after physically receiving the full COD amount. Packing alone never means payment was collected. Payment confirmation does not change `status`, packing data, order lines, prices, or inventory.

The employee list continues to show `paymentStatus`. Admin order detail includes confirmation metadata. Customer order responses continue to include `paymentMethod` and `paymentStatus` but must not expose the employee ID or confirmation timestamp.

## Payment and order behavior

New orders use `paymentMethod = 'cod'`, `paymentStatus = 'unpaid'`, and `status = 'pending'`. Packing remains the existing direct `pending` to `packed` action.

Payment confirmation runs in one transaction:

1. Lock the `sales_order` row with a pessimistic write lock.
2. Require `status = 'packed'`, `payment_method = 'cod'`, and `payment_status = 'unpaid'`.
3. Set `payment_status = 'paid'`, `payment_confirmed_at = CURRENT_TIMESTAMP`, and `payment_confirmed_by_employee_id` from the authenticated employee.
4. Reload the admin order detail and return it before committing.

Only the first confirmation succeeds. Repeated or invalid transitions create no additional payment record and return `409`. A successful confirmation means the employee has confirmed receipt of the full order total; the MVP does not model partial receipts or refunds.

## Data model and migration

Add a forward TypeORM migration that:

- Allows `payment_status` values `unpaid` and `paid`.
- Restricts non-null `payment_method` values to `cod`, while allowing legacy `null` values.
- Adds nullable `payment_confirmed_at timestamptz` and `payment_confirmed_by_employee_id integer` columns to `sales_order`.
- Adds a restrictive FK from the confirming employee to `employee` and a consistency check: unpaid orders have no confirmation metadata; paid orders must have a non-null `payment_method = 'cod'`, a confirmation timestamp, and a confirming employee.
- Requires an active migration transaction for both `up` and `down`. The rollback acquires an `ACCESS EXCLUSIVE` lock on `sales_order` before checking for paid orders, then refuses rollback if any exist. This prevents a concurrent confirmation from being committed after the safety check and erased by the rollback.

Mark the two new entity properties as excluded from ordinary TypeORM selects. Admin detail explicitly selects them; customer order handlers must not return them. The order's `paymentMethod` and `paymentStatus` remain in existing customer and admin responses. Add both columns to `SALES_ORDER` in the corrected Mermaid ERD and describe the COD confirmation flow in the backend README.

## Acceptance criteria

- Customer requests cannot supply or override payment method, status, confirmation time, or employee.
- New orders are saved as COD and unpaid.
- Only an active `order_staff` or `admin` employee can mark a packed, unpaid COD order paid.
- Payment confirmation is serialized with packing and any competing confirmation through the sales-order row lock.
- Repeated confirmation and confirmation of pending/cancelled, already-paid, or non-COD orders return `409` without changing data.
- Admin order detail returns confirmation time and employee; customer order responses do not expose either field.
- The database constraints and entity definitions agree, and migration rollback refuses to discard paid-order data.
- Backend README and corrected Mermaid ERD describe the same behavior. No frontend files change.
