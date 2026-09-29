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
    SALES_ORDER ||--o| PACKING : has
    EMPLOYEE ||--o{ PACKING : packs
```

## Constraints and purchase/order/packing rules

- `ORDER_DETAIL` uses `(order_id, variant_id)` as its primary key; `IMPORT_DETAIL` uses `(import_id, variant_id)`. Each variant occurs once in a document's detail rows.
- `PROMOTION` requires `start_date <= end_date`; status is `active` or `inactive`. `PROMOTION_DETAIL` belongs to one promotion with a restrictive foreign key; its date range is also ordered, status is `active` or `inactive`, and type is `fixed` or `percentage`. Codes are trimmed and stored uppercase, limited to 64 ASCII letters, digits, hyphens, or underscores, and globally unique (`UQ_promotion_detail_code`). Codes are immutable through the API. A campaign and voucher must both be active and both date ranges must inclusively contain PostgreSQL `CURRENT_DATE` to apply.
- `PROMOTION_DETAIL.discount_value` and `min_price` are `numeric(24,2)`; discount is positive, minimum is nonnegative, and percentage discount is at most `100.00`. Nullable `max_discount` is positive when set and only allowed for percentage vouchers. `quantity` is a positive integer and caps redemptions across all customers. Promotion indexes cover `(status, start_date, end_date)`; voucher indexes cover `promotion_id` and `(status, start_date, end_date)`.
- `SALES_ORDER.voucher_id` is nullable and references `PROMOTION_DETAIL.voucher_id` with `ON DELETE RESTRICT`; `IDX_sales_order_voucher_id_status` supports the redemption count by voucher and order status. One order uses zero or one voucher, while one voucher may be referenced by many orders. Historical `voucher_id` and `discount_amount` remain on the order; later voucher edits do not recalculate existing totals. There is no hard-delete route for campaigns or vouchers; deactivate them by changing status.
- Voucher usage is the count of referencing `SALES_ORDER` rows in `pending` or `packed` status. A pending cancellation changes the order status to `cancelled` and releases that use; packed orders continue to count. Redemptions are serialized by locking the promotion then voucher during checkout. Employees cannot lower `quantity` below the current count of pending and packed orders.
- Merchandise subtotal is the sum of server-calculated order detail subtotals before discounts. `min_price` is checked against this subtotal. Fixed discounts are capped at the subtotal. Percentage discounts are rounded half-up to cents, then capped by `max_discount` when present and by the subtotal in all cases. Shipping is not discounted; `total_amount = merchandise subtotal - discount_amount + shipping_fee`. The current MVP shipping fee is `0.00`, and COD remains the only payment method.
- `SALES_ORDER.status` is `pending`, `packed`, or `cancelled`; customer cancellation is permitted only while `pending`, and the employee packing action transitions directly from `pending` to `packed`.
- New customer orders are assigned `payment_method = 'cod'` and `payment_status = 'unpaid'` by the server; customers cannot choose or override payment fields. Legacy rows may keep a null payment method. Payment status is `unpaid` or `paid`; an unpaid order has no confirmation timestamp or employee, while a paid order must use COD and have both confirmation fields.
- An active employee may confirm payment only for a packed, unpaid COD order, after physically receiving the full `total_amount` in cash. Packing does not mean payment was received. Confirmation records PostgreSQL `CURRENT_TIMESTAMP` and the employee ID, changes the payment status to `paid`, and leaves order status `packed`; only one confirmation can succeed. Pending/cancelled, non-COD, and already-paid orders cannot be confirmed. Customer order responses omit the confirmation fields; admin order detail includes them. The current backend does not model partial payment, refunds, or a delivery lifecycle.
- An order has zero or one packing row. Each packing row belongs to exactly one order; the required unique `packing.order_id` FK enforces at most one packing row per order. Each packing row also references exactly one required employee; one employee may pack many orders.
- MVP packing records the server timestamp, `packed` status, required employee, and optional note; packaging type is nullable and restricted to `bag` or `box`. The order-to-packing relationship is one-to-zero-or-one. It has no package weight or packing fee. `SALES_ORDER.shipping_fee` remains a separate delivery charge.
- Voucher codes and employee/customer emails are unique. There is no invoice table or invoice API in the current backend.
- `IMPORT_DETAIL.quantity` and `ORDER_DETAIL.quantity` are document/order quantities only. They are not combined into an available-stock balance, and this schema does not track inventory movements or balances.
- Creating an import records its supplier, employee, variants, quantities, and prices as purchase history; it does not replenish a computed stock balance. Creating an order validates active products and variant references but does not check available stock. Cancelling a pending order changes its status only and does not restore or otherwise change stock.
