# Sales system ERD (corrected)

This Mermaid diagram is the editable, current model. The adjacent PNG is retained as a historical reference only and is not the current ERD; it includes outdated `Packing.weight` and `packing_fee` fields that are outside the approved MVP. Physical `sales_order` replaces the ambiguous/reserved table name `Order` in PostgreSQL.

```mermaid
erDiagram
    CATEGORY {
        int category_id PK
        varchar name
        text description "nullable"
    }
    PRODUCT {
        int product_id PK
        varchar name
        text description "nullable"
        varchar brand "nullable"
        varchar status
        int category_id FK
    }
    PRODUCT_IMAGE {
        int product_image_id PK
        int product_id FK
        varchar(2048) image_url "HTTPS URL; demo image source"
        varchar(200) alt_text "nullable"
        int sort_order "nonnegative"
        boolean is_primary
    }
    PRODUCT_VARIANT {
        int variant_id PK
        varchar size "nullable"
        varchar color "nullable"
        numeric price
        int product_id FK
    }
    PROMOTION {
        int promotion_id PK
        varchar(120) name
        text description "nullable"
        date start_date
        date end_date
        varchar(20) status "active or inactive; defaults active"
    }
    PROMOTION_DETAIL {
        int voucher_id PK
        int promotion_id FK "required, ON DELETE RESTRICT"
        varchar(64) code UK "canonical uppercase"
        varchar(120) name
        varchar(20) type "fixed or percentage"
        numeric(24,2) discount_value
        date start_date
        date end_date
        numeric(24,2) min_price
        numeric(24,2) max_discount "nullable, percentage only"
        int quantity "1 to 2147483647; global redemption cap"
        varchar(20) status "active or inactive; defaults active"
    }
    CUSTOMER {
        int customer_id PK
        varchar name
        date date_of_birth "nullable"
        varchar email UK
        varchar phone "nullable"
        varchar password_hash
        text address "nullable"
        varchar gender "nullable"
    }
    SALES_ORDER {
        int order_id PK
        timestamptz order_date
        varchar recipient_name "max 120"
        varchar recipient_phone "max 30"
        text shipping_address
        numeric discount_amount "voucher snapshot; defaults 0.00"
        numeric shipping_fee
        varchar payment_method "nullable for legacy rows"
        varchar payment_status
        timestamptz payment_confirmed_at "nullable until paid"
        int payment_confirmed_by_employee_id FK "nullable, ON DELETE RESTRICT"
        varchar(20) status "pending, packed, cancelled"
        text note "nullable"
        numeric total_amount
        int voucher_id FK "nullable, ON DELETE RESTRICT"
        int customer_id FK
        varchar(255) idempotency_key "nullable, PayOS only"
        varchar(64) request_fingerprint "nullable, SHA-256 hex"
    }
    PAYMENT_ATTEMPT {
        int payment_attempt_id PK
        int order_id FK, UK
        varchar(20) provider "payos"
        int provider_order_code UK
        varchar(255) provider_payment_link_id "nullable"
        text checkout_url "nullable, withheld if orphaned"
        numeric(24,2) amount "positive whole VND"
        varchar(32) status "creating, pending, paid, cancelled, expired, failed, reconciliation_required"
        timestamptz setup_lease_expires_at
        timestamptz expires_at "order date + 15 minutes"
        timestamptz paid_at "nullable"
        varchar(255) provider_reference "nullable, unique when set"
        numeric(24,2) observed_amount_paid "nullable, whole VND"
        text reconciliation_reason "nullable"
        timestamptz reconciliation_at "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    ORDER_DETAIL {
        int order_id PK, FK
        int variant_id PK, FK
        int quantity
        numeric unit_price
        numeric subtotal
    }
    SUPPLIER {
        int supplier_id PK
        varchar name
        text address "nullable"
        varchar email "nullable"
    }
    STOCK_IMPORT {
        int import_id PK
        timestamptz import_date
        numeric total_amount
        text note "nullable"
        int supplier_id FK
        int employee_id FK
    }
    IMPORT_DETAIL {
        int import_id PK, FK
        int variant_id PK, FK
        int quantity
        numeric unit_price
        numeric subtotal
    }
    PACKING {
        int packing_id PK
        timestamptz packing_date
        varchar(10) packing_type "nullable: bag or box"
        varchar(20) status "packed only"
        text note "nullable"
        int employee_id FK "required, ON DELETE RESTRICT"
        int order_id FK, UK "required, unique, ON DELETE RESTRICT"
    }
    INVOICE {
        int invoice_id PK
        timestamptz issued_date
        numeric(24,2) total_amount "snapshot at issue time; internal MVP receipt"
        varchar(20) status "issued"
        int order_id FK, UK "required, unique, ON DELETE RESTRICT"
    }
    EMPLOYEE {
        int employee_id PK
        varchar name
        varchar email UK
        varchar phone "nullable"
        varchar password_hash
        varchar position
        varchar status
    }
    CATEGORY ||--o{ PRODUCT : contains
    PRODUCT ||--o{ PRODUCT_IMAGE : displays
    PRODUCT ||--o{ PRODUCT_VARIANT : has
    PROMOTION ||--o{ PROMOTION_DETAIL : has
    PROMOTION_DETAIL o|--o{ SALES_ORDER : applied_to
    CUSTOMER ||--o{ SALES_ORDER : places
    SALES_ORDER ||--|{ ORDER_DETAIL : contains
    PRODUCT_VARIANT ||--o{ ORDER_DETAIL : ordered_as
    SUPPLIER ||--o{ STOCK_IMPORT : supplies
    EMPLOYEE ||--o{ STOCK_IMPORT : records
    STOCK_IMPORT ||--|{ IMPORT_DETAIL : contains
    PRODUCT_VARIANT ||--o{ IMPORT_DETAIL : received_as
    EMPLOYEE o|--o{ SALES_ORDER : confirms_payment
    SALES_ORDER ||--o| PAYMENT_ATTEMPT : has_payment_attempt
    SALES_ORDER ||--o| PACKING : has
    SALES_ORDER ||--o| INVOICE : has
    EMPLOYEE ||--o{ PACKING : packs
```

## Constraints and purchase/order/packing rules

- `PRODUCT_IMAGE` stores external HTTPS image URLs and optional alt text, not binary image data. A product may have up to 12 images through the API; at most one image per product may be primary. If an API request omits the primary marker, the image with the lowest `sort_order` becomes primary (input order breaks ties). The storefront list returns its primary image URL, and product detail returns the ordered image list. Demo placeholder URLs may be used until real product photography is available.
- `ORDER_DETAIL` uses `(order_id, variant_id)` as its primary key; `IMPORT_DETAIL` uses `(import_id, variant_id)`. Each variant occurs once in a document's detail rows.
- Order lines reference the product variant and retain the unit price used at purchase. Order history reads product name, size, and color from the current catalog, so later catalog edits can change how older order lines are displayed.
- `PROMOTION` requires `start_date <= end_date`; status is `active` or `inactive`. `PROMOTION_DETAIL` belongs to one promotion with a restrictive foreign key; its date range is also ordered, status is `active` or `inactive`, and type is `fixed` or `percentage`. Codes are trimmed and stored uppercase, limited to 64 ASCII letters, digits, hyphens, or underscores, and globally unique (`UQ_promotion_detail_code`). Codes are immutable through the API. A campaign and voucher must both be active and both date ranges must inclusively contain PostgreSQL `CURRENT_DATE` to apply.
- `PROMOTION_DETAIL.discount_value` and `min_price` are `numeric(24,2)`; discount is positive, minimum is nonnegative, and percentage discount is at most `100.00`. Nullable `max_discount` is positive when set and only allowed for percentage vouchers. `quantity` is a positive integer and caps redemptions across all customers. Promotion indexes cover `(status, start_date, end_date)`; voucher indexes cover `promotion_id` and `(status, start_date, end_date)`.
- `SALES_ORDER.voucher_id` is nullable and references `PROMOTION_DETAIL.voucher_id` with `ON DELETE RESTRICT`; `IDX_sales_order_voucher_id_status` supports the redemption count by voucher and order status. One order uses zero or one voucher, while one voucher may be referenced by many orders. Historical `voucher_id` and `discount_amount` remain on the order; later voucher edits do not recalculate existing totals. There is no hard-delete route for campaigns or vouchers; deactivate them by changing status.
- Voucher usage is the count of referencing `SALES_ORDER` rows in `pending` or `packed` status. A pending cancellation changes the order status to `cancelled` and releases that use; packed orders continue to count. Redemptions are serialized by locking the promotion then voucher during checkout. Employees cannot lower `quantity` below the current count of pending and packed orders.
- Merchandise subtotal is the sum of server-calculated order detail subtotals before discounts. `min_price` is checked against this subtotal. Fixed discounts are capped at the subtotal. Percentage discounts are rounded half-up to cents, then capped by `max_discount` when present and by the subtotal in all cases. Shipping is not discounted; `total_amount = merchandise subtotal - discount_amount + shipping_fee`. The current MVP shipping fee is `0.00`; `payment_method` accepts `cod` or `payos`, defaulting to COD for new orders. Historical rows may have a null method.
- `SALES_ORDER.status` is `pending`, `packed`, or `cancelled`; customer cancellation is permitted only while `pending`, and the employee packing action transitions directly from `pending` to `packed`.
- New COD customer orders are assigned `payment_method = 'cod'` and `payment_status = 'unpaid'`; a customer may explicitly choose `payos`. Customers cannot supply price, amount, discount, payment status, or order status. A PayOS order whose final total is zero is marked paid locally without a provider call or payment-attempt row. Positive PayOS totals must be whole VND amounts and fit an exact safe integer; totals with fractional VND are rejected rather than rounded. Payment status is `unpaid` or `paid`; unpaid orders have no confirmation timestamp/employee, paid COD orders have both, while paid PayOS orders have a confirmation timestamp and no employee.
- `SALES_ORDER.idempotency_key` and `request_fingerprint` are nullable together and used for PayOS creation only. For a PayOS request the customer must send an `Idempotency-Key` (1–255 characters matching `[A-Za-z0-9._~:-]+`). The partial unique index `UQ_sales_order_customer_idempotency_key` enforces one order per customer/key where the key is present. Same key and same request fingerprint resumes/returns that order; same key with a different fingerprint conflicts. COD preserves its existing request behavior.
- `PAYMENT_ATTEMPT` is a one-to-zero-or-one record per sales order, created atomically with positive-total PayOS orders; COD and zero-total PayOS orders have no attempt. `order_id` and `provider_order_code` are unique; provider order code is the sales order ID. Provider is currently `payos`. Attempt amount and any observed paid amount are stored as whole VND in `numeric(24,2)` with database checks; final link amount must equal the order total exactly. Attempt status is `creating`, `pending`, `paid`, `cancelled`, `expired`, `failed`, or `reconciliation_required`. `provider_reference` has a partial unique index when non-null. `checkout_url`, link ID, reference, observed amount, reconciliation reason and timestamps are nullable because create/lookup outcomes can require reconciliation; the checkout URL is never exposed to admin responses.
- A positive-total PayOS link expires 15 minutes after `sales_order.order_date`; setup/retry leases prevent duplicate concurrent creation. Customer retries must reuse the same idempotency key and request. The public webhook verifies its signature, then verifies local order code/link/amount against PayOS's fetched link; only provider status `PAID` with exact full amount paid and zero remaining settles the order. Browser redirects and callback payloads alone do not establish payment. Successful PayOS reconciliation sets `payment_status = 'paid'`, records `payment_confirmed_at`, leaves `payment_confirmed_by_employee_id` null, and marks the attempt paid.
- A scheduler reconciles links every minute. For a known checkout URL, it only cancels the local pending order (and thereby releases a voucher use) after PayOS confirms the correct link/amount, zero paid amount, and terminal unpaid state. Partial payment, mismatches, or unavailable provider state keep the order and voucher reservation for review. If PayOS created a link but the response timed out before a checkout URL was stored locally, it is an orphan requiring admin review: do not create a replacement, automatically cancel/release the voucher, or allow customer cancellation even if later lookup reports the orphan link unpaid/cancelled. Full valid payment can still settle through reconciliation.
- An active employee may confirm payment only for a packed, unpaid COD order (or a legacy null-method row), after physically receiving the full `total_amount` in cash. Packing does not mean payment was received. Confirmation records PostgreSQL `CURRENT_TIMESTAMP` and the employee ID, changes the payment status to `paid`, and leaves order status `packed`; only one confirmation can succeed. Pending/cancelled, PayOS, and already-paid orders cannot be confirmed by an employee. A PayOS order must be paid before it may be packed. Customer order responses omit the confirmation attribution fields; admin order detail includes them along with safe reconciliation metadata but no checkout URL. The current backend does not support partial-payment settlement or refunds; partial provider amounts remain recorded as reconciliation observations. It does not model a delivery lifecycle.
- An order has zero or one packing row. Each packing row belongs to exactly one order; the required unique `packing.order_id` FK enforces at most one packing row per order. Each packing row also references exactly one required employee; one employee may pack many orders.
- MVP packing records the server timestamp, `packed` status, required employee, and optional note; packaging type is nullable and restricted to `bag` or `box`. The order-to-packing relationship is one-to-zero-or-one. It has no package weight or packing fee. `SALES_ORDER.shipping_fee` remains a separate delivery charge.
- An `INVOICE` row is an internal MVP payment receipt, not an electronic invoice or a legally compliant tax invoice. An order has zero or one invoice; each invoice references exactly one order through a unique restrictive FK. The amount is a snapshot of the order total at issue time. The backend issues it in the same transaction as a confirmed payment (PayOS full settlement, employee confirmation of packed COD, or creation of a zero-total PayOS order). Unpaid and cancelled orders have no invoice. Customers can read only their own invoice summary; active employees can read an order's invoice summary. No manual issue, cancellation, refund, tax-document, or frontend flow is part of this MVP.
- `IMPORT_DETAIL.quantity` and `ORDER_DETAIL.quantity` are document/order quantities only. They are not combined into an available-stock balance, and this schema does not track inventory movements or balances.
- Creating an import records its supplier, employee, variants, quantities, and prices as purchase history; it does not replenish a computed stock balance. Creating an order validates active products and variant references but does not check available stock. Cancelling a pending order changes its status only and does not restore or otherwise change stock.
