# Sales system ERD (corrected)

This Mermaid diagram is the editable, corrected model. The adjacent PNG is retained as the originally supplied image. Physical `sales_order` replaces the ambiguous/reserved table name `Order` in PostgreSQL.

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
        numeric discount_amount
        numeric shipping_fee
        varchar payment_method
        varchar payment_status
        varchar status
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
        varchar packing_type
        numeric packing_fee
        numeric weight
        varchar status
        text note
        int employee_id FK
        int order_id FK, UK
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
    INVENTORY_MOVEMENT {
        int movement_id PK
        int variant_id FK
        varchar direction
        varchar movement_type
        int quantity
        timestamptz effective_at
        int employee_id FK
        int import_id FK
        int order_id FK
        text note
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
    PRODUCT_VARIANT ||--o{ INVENTORY_MOVEMENT : changes
    EMPLOYEE ||--o{ INVENTORY_MOVEMENT : records
    IMPORT_DETAIL ||--o| INVENTORY_MOVEMENT : creates_inbound
    ORDER_DETAIL ||--o| INVENTORY_MOVEMENT : creates_on_fulfillment
```

## Constraints and stock rules

- `ORDER_DETAIL` uses `(order_id, variant_id)` as its primary key; `IMPORT_DETAIL` uses `(import_id, variant_id)`. Each variant occurs once in a document's detail rows.
- An order has zero or one packing row and zero or one invoice row while being processed; each packing/invoice row belongs to exactly one order (`order_id` is unique in both tables).
- Voucher codes and employee/customer emails are unique. `INVOICE.total_amount` is an immutable issue-time amount snapshot; payment method/status remain on `SALES_ORDER`, so the duplicate invoice method is removed.
- `INVENTORY_MOVEMENT` is an append-only quantity ledger. `direction` is `in` or `out`; `movement_type` is `opening`, `import`, `sale`, or `adjustment`. Opening/import are inbound, fulfilled sales outbound, and adjustments can be either. Opening quantity may be zero; other movement quantities are positive integers.
- Import movements have a unique FK to the source `(import_id, variant_id)` detail. A sale movement has a unique FK to its `(order_id, variant_id)` order detail; the order schema and FK are added in the order phase. Opening and adjustment movements have no source document.
- At period start, beginning stock is the net of all earlier movements. Period ending stock is beginning stock plus inbound quantity minus outbound quantity. Pending/canceled orders do not create outbound movements.
