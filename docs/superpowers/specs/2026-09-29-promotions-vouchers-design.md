# Promotions and Vouchers Design

## Goal

Allow employees to manage promotion campaigns and voucher codes, and allow customers to apply one voucher while placing an order. All behavior is backend-only. The existing TypeScript, NestJS, PostgreSQL, and TypeORM stack remains in use; COD remains the only payment method.

## Scope

- Add role-protected CRUD-style read/create/update APIs for promotion campaigns and nested vouchers; access requires `manager` or `admin`. Records are deactivated through `status`; there are no hard-delete endpoints.
- Accept an optional `voucherCode` in customer order creation. Validate the campaign and voucher, calculate the discount on the server, and save the voucher reference and monetary snapshots with the order atomically.
- Support fixed-amount and percentage discounts, minimum merchandise subtotal, an optional maximum percentage discount, effective date ranges, and a global redemption limit.
- A voucher may be used multiple times by the same customer, up to the global limit. Each order may use at most one voucher.
- A pending order that is cancelled releases its voucher use. Packed orders count as redemptions and cannot be cancelled by the customer under the existing order rules.
- Return `voucherCode` and `discountAmount` in customer and employee order responses. Voucher codes are canonical uppercase at creation and immutable afterward, preserving the code shown on historical orders.
- Update the backend README and current Mermaid ERD. Do not change frontend files.

Out of scope: per-customer redemption limits, stacking codes, a standalone voucher-preview endpoint, product/category-specific eligibility, deletion of promotion history, online payment, refunds, and frontend work.

## API and access

All promotion and voucher management routes require an active employee JWT with role `manager` or `admin`. An active employee without either role receives `403`; invalid, wrong-actor, or inactive credentials receive `401`. The complete role matrix and employee provisioning rules are in the [current role design](2026-10-06-admin-manager-roles-design.md). Customer order creation keeps its customer JWT guard.

- `GET /promotions`: list promotions.
- `GET /promotions/:promotionId`: read one promotion.
- `POST /promotions`: create a promotion with `name`, `startDate`, `endDate`, and optional `description` and `status`.
- `PATCH /promotions/:promotionId`: update any supplied subset of `name`, `description`, `startDate`, `endDate`, and `status`.
- `GET /promotions/:promotionId/vouchers`: list the campaign's vouchers.
- `GET /promotions/:promotionId/vouchers/:voucherId`: read one voucher belonging to the campaign.
- `POST /promotions/:promotionId/vouchers`: create a voucher with `code`, `name`, `type`, `discountValue`, `startDate`, `endDate`, `minPrice`, optional `maxDiscount`, `quantity`, and optional `status`.
- `PATCH /promotions/:promotionId/vouchers/:voucherId`: update any supplied subset of `name`, `type`, `discountValue`, `startDate`, `endDate`, `minPrice`, `maxDiscount`, `quantity`, and `status`. `code` is immutable.
- Extend `POST /orders` with optional `voucherCode`.

There are no `DELETE` routes. Employees deactivate a promotion or voucher by setting `status` to `inactive`. The voucher's campaign and code remain available to explain existing orders. Missing management resources return `404`; malformed input returns `400`; duplicate codes and attempts to reduce `quantity` below current redemptions return `409`.

If `voucherCode` is omitted, order creation keeps `voucherId = null` and `discountAmount = 0.00`. An invalid, inactive, not-yet-valid, expired, exhausted, or minimum-not-met code returns `400` with a message identifying why it cannot be applied. The request writes no order or order details on failure.

## Voucher rules and money calculation

- Normalize a submitted or created code by trimming and converting to uppercase. Accept only uppercase ASCII letters, digits, hyphens, and underscores after normalization. Enforce global uniqueness in PostgreSQL. A code cannot be changed after creation.
- A promotion and its voucher must both have `status = active`, and the database's current calendar date must fall inclusively within both date ranges. Each date range must have `start_date <= end_date`; the two ranges need not be identical.
- `minPrice` is compared with the sum of merchandise line subtotals before discount. Shipping is not discountable. The existing MVP shipping fee remains `0.00`.
- `type` is `fixed` or `percentage`. A fixed discount is capped at the merchandise subtotal. A percentage discount is between `0.01` and `100.00`, rounded half-up to the nearest cent, optionally capped by `maxDiscount`, and never exceeds the merchandise subtotal. `maxDiscount` is nullable and applies only to percentage discounts. `minPrice` and money values are nonnegative; `discountValue` and any supplied `maxDiscount` must be positive.
- `quantity` is a positive integer redemption cap across all customers. Redemption count is the number of orders referencing the voucher whose status is `pending` or `packed`. Cancelled orders do not count. Updating a cap below the current count is rejected.
- The resulting order total is `merchandiseSubtotal - discountAmount + shippingFee`; it cannot be negative. Unit prices and line subtotals continue to be snapshotted and calculated by the server using integer cents/BigInt. No client-supplied price, discount, voucher ID, or total is accepted.
- A voucher's saved `discount_amount` and `voucher_id` on an order are historical snapshots/references. Later changes to promotion settings do not recalculate existing orders.

## Transactions and concurrency

Order creation remains a single database transaction. After validating and pricing the distinct active variants, a request with a voucher:

1. Locks the promotion and voucher rows for update in a consistent `promotion` then `voucher` order.
2. Rechecks status and inclusive date eligibility while holding the locks.
3. Counts existing non-cancelled orders for that voucher and checks the global cap and `minPrice`.
4. Calculates the discount using integer cents, then saves the order (including `voucher_id`, `discount_amount`, COD fields), details, and response data.

The row locks serialize simultaneous attempts to redeem the same voucher. A failed check or insert rolls back the whole order transaction. Without a voucher, the existing flow and totals are unchanged.

Customer cancellation continues to lock the `sales_order` row and permits only `pending` orders. It changes the status to `cancelled` in the same transaction. This removes that order from future redemption counts and releases its voucher use exactly once; no separate decrement or restoration counter is stored. A packed order remains counted.

Management updates that affect eligibility lock the relevant promotion/voucher rows. Updating `quantity` also locks the voucher and checks its current redemption count before saving. Thus deactivation, date changes, and cap changes serialize with new redemptions.

## Data model and migration

Add TypeORM entities for `promotion` and `promotion_detail` (the latter is exposed in the API as a voucher). Use generated integer primary keys; `varchar(120)` names; nullable `text` descriptions; `varchar(64)` canonical voucher codes; `varchar(20)` status/type; SQL `date` start/end values accepted as `YYYY-MM-DD`; `numeric(24,2)` for `discount_value`, `min_price`, and `max_discount`; and positive integer `quantity`. Promotion and voucher status default to `active`.

Add database checks for valid statuses, ordered date ranges, supported voucher types, positive discounts and quantity, nonnegative minimum price, valid percentage range, and percentage-only optional maximum discount. Store canonical uppercase codes and enforce a unique constraint. Add the restrictive promotion FK from voucher to campaign.

Add nullable `voucher_id` to `sales_order`, a restrictive FK to `promotion_detail`, and an index supporting redemption counts by voucher and order status. Existing orders remain without a voucher. Update the `SalesOrder` entity and order response loading/mapping accordingly.

The `down` migration must run in a transaction and acquire an `ACCESS EXCLUSIVE` lock on `sales_order` before checking whether any order references a voucher. It must abort if a reference exists. The table lock prevents a concurrent checkout from adding a voucher reference after the safety check and before the FK/column are removed. If no reference exists, the migration may remove the FK/column and promotion tables.

## Errors and response behavior

- Invalid or unavailable voucher and a subtotal below `minPrice`: `400 Bad Request`, without partial order data.
- Malformed date, status, code, type, percentage, or amount input: `400 Bad Request`.
- Duplicate canonical code or lowering a cap below current redemptions: `409 Conflict`.
- Unknown campaign/voucher or a voucher not belonging to the supplied campaign: `404 Not Found`.
- Every customer and employee order response, including list items, create responses, and detail responses, includes `voucherCode` (`null` if not applied) and the stored `discountAmount`; `totalAmount` reflects the discount.

## Acceptance criteria

- Employees with role `manager` or `admin` can create/list/read/update promotions and their vouchers; codes are unique after normalization and cannot be edited or hard-deleted.
- Customer order requests can apply at most one active, in-date voucher and cannot override the server's calculated discount or total.
- Fixed and percentage discounts, minimum subtotal, optional percentage cap, and cent rounding follow the rules above.
- Voucher redemption caps cannot be exceeded by concurrent order creation; pending cancellation releases one use and repeated cancellation cannot release another.
- A voucher failure leaves no partial order or detail rows. Existing orders remain unchanged when promotion settings are later updated.
- COD payment, packing, customer authentication, and order ownership behavior remain unchanged. No frontend files change.
- Database migration, entities, API documentation, backend README, and Mermaid ERD agree on the schema and rules.

