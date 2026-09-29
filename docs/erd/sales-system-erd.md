# Sales system ERD (corrected)

This Mermaid diagram is the editable, current model. The adjacent PNG is retained as a historical reference only and is not the current ERD; it includes outdated `Packing.weight` and `packing_fee` fields that are outside the approved MVP. Physical `sales_order` replaces the ambiguous/reserved table name `Order` in PostgreSQL.

```mermaid
erDiagram
    CATEGORY {
        int category_id PK
        varchar name
        text description
    }
    PRODUCT {
        int product_id PK
        varchar name
        text description
        varchar brand
        varchar status
        int category_id FK
    }
    PRODUCT_VARIANT {
        int variant_id PK
        varchar size
        varchar color
        numeric price
        int product_id FK
    }
    PROMOTION {
        int promotion_id PK
        varchar name
        text description
        date start_date
        date end_date
        varchar status
    }
    PROMOTION_DETAIL {
        int voucher_id PK
        varchar code UK
        varchar name
        varchar type
        numeric discount_value
        date start_date
        date end_date
        numeric min_price
        numeric max_discount
        int quantity
        varchar status
        int promotion_id FK
    }
    CUSTOMER {
        int customer_id PK
        varchar name
        date date_of_birth
        varchar email UK
        varchar phone
        varchar password_hash
        text address
        varchar gender
    }
    SALES_ORDER {
        int order_id PK
        timestamptz order_date
        varchar recipient_name "max 120"
        varchar recipient_phone "max 30"
        text shipping_address
        numeric discount_amount
        numeric shipping_fee
        varchar payment_method
        varchar payment_status
        varchar(20) status "pending, packed, cancelled"
        text note
        numeric total_amount
        int voucher_id FK
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
        text address
        varchar email
    }
    STOCK_IMPORT {
        int import_id PK
        timestamptz import_date
        numeric total_amount
        text note
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
        text note
        int employee_id FK "required, ON DELETE RESTRICT"
        int order_id FK, UK "required, unique, ON DELETE RESTRICT"
    }
    INVOICE {
        int invoice_id PK
        timestamptz invoice_date
        numeric total_amount
        int order_id FK, UK
    }
    EMPLOYEE {
        int employee_id PK
        varchar name
        varchar email UK
        varchar phone
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
    SALES_ORDER ||--o| PACKING : has
    EMPLOYEE ||--o{ PACKING : packs
    SALES_ORDER ||--o| INVOICE : has
```

## Constraints and purchase/order/packing rules

- `ORDER_DETAIL` uses `(order_id, variant_id)` as its primary key; `IMPORT_DETAIL` uses `(import_id, variant_id)`. Each variant occurs once in a document's detail rows.
- `SALES_ORDER.status` is `pending`, `packed`, or `cancelled`; customer cancellation is permitted only while `pending`, and the employee packing action transitions directly from `pending` to `packed`.
- An order has zero or one packing row and zero or one invoice row while being processed. Each packing/invoice row belongs to exactly one order; the required unique `packing.order_id` FK enforces at most one packing row per order. Each packing row also references exactly one required employee; one employee may pack many orders.
- MVP packing records the server timestamp, `packed` status, required employee, and optional note; packaging type is nullable and restricted to `bag` or `box`. The order-to-packing relationship is one-to-zero-or-one. It does not require package weight or a packing fee. `SALES_ORDER.shipping_fee` remains a separate delivery charge.
- Voucher codes and employee/customer emails are unique. `INVOICE.total_amount` is an immutable issue-time amount snapshot; payment method/status remain on `SALES_ORDER`, so the duplicate invoice method is removed.
- `IMPORT_DETAIL.quantity` and `ORDER_DETAIL.quantity` are document/order quantities only. They are not combined into an available-stock balance, and this schema does not track inventory movements or balances.
- Creating an import records its supplier, employee, variants, quantities, and prices as purchase history; it does not replenish a computed stock balance. Creating an order validates active products and variant references but does not check available stock. Cancelling a pending order changes its status only and does not restore or otherwise change stock.
