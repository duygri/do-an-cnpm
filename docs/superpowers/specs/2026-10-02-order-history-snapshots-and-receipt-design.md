# Order history snapshots and MVP receipt terminology

## Goal

Keep order-line product and variant descriptions stable after catalog edits, and describe the existing internal invoice record accurately as an MVP receipt. Preserve the current invoice schema and API for compatibility.

## Current behavior

- `order_detail` stores the selected variant ID, quantity, unit price, and subtotal, but does not store the product name, size, or color as they were when the order was placed.
- Admin order detail resolves `productName`, `size`, and `color` from the current product and variant rows. Editing catalog data can therefore change how a historical order is displayed.
- Customer order detail returns order lines without those three display fields.
- The `invoice` record stores an issue timestamp, order total, status, and unique order reference. It is an internal payment record/summary and lacks tax invoice numbering, tax details, seller/buyer fiscal data, or an external invoicing integration.

## Approved design

### Order-line snapshots

Add these columns to `order_detail`:

| Column | Type | Nullability | Meaning |
| --- | --- | --- | --- |
| `product_name_snapshot` | `varchar(200)` | required | Product name at order placement |
| `variant_size_snapshot` | `varchar(50)` | nullable | Variant size at order placement |
| `variant_color_snapshot` | `varchar(50)` | nullable | Variant color at order placement |

At order creation, read the selected variant and its product within the existing order-creation transaction. Copy the product name, size, and color into each new order detail before commit. The product name must exist; nullable size/color values remain null. Once created, these snapshots are immutable through order and catalog APIs.

Keep `variant_id` and its foreign key, quantity, unit price, and subtotal. The variant reference continues to identify the catalog item for existing relationships; the snapshot columns provide the order-history display values. Do not snapshot product description, brand, images, or other catalog fields in this change.

### Existing order lines and migration

The migration adds the three columns, backfills every existing detail from its current `product_variant` and `product` rows, then makes `product_name_snapshot` required. Backfilled values represent the catalog state available when the migration runs; the original historical name, size, or color cannot be recovered if it was previously edited. Preserve all order IDs, variant IDs, prices, quantities, subtotals, and totals.

The migration `up` and `down` paths must require an active transaction and fail before doing database work if one is not active. Rollback drops only the three new columns. It preserves all existing order and detail rows, IDs, prices, quantities, subtotals, and totals, but intentionally discards the historical values stored in these snapshot columns. The schema change is reversible; snapshot data is not recoverable after rollback.

### API behavior

- `GET /admin/orders/:orderId` keeps its existing response shape and the detail keys `productName`, `size`, and `color`; populate them from the snapshot columns. Do not join live product/variant rows to obtain these three display values.
- Full-order customer responses from `POST /orders`, `GET /orders/:orderId`, and `POST /orders/:orderId/cancel` keep their existing order and detail fields and add `productName`, `size`, and `color` to each detail, sourced from the snapshots. The public responses use these API names; they do not expose the storage names `productNameSnapshot`, `variantSizeSnapshot`, or `variantColorSnapshot`. This is an additive response change.
- Customer order-list responses remain unchanged.
- Sorting, money formats, ownership checks, employee RBAC, status transitions, and packing behavior remain unchanged.

### Internal invoice naming

Keep the database table, entity, TypeORM migration history, and routes named `invoice` for backward compatibility. Keep the current response fields (`invoiceId`, `orderId`, `issuedDate`, `totalAmount`, and `status`) and paid-order issuance/idempotency behavior unchanged.

Update backend-facing documentation and descriptions to call this an **internal MVP payment receipt** (Vietnamese: **biên nhận thanh toán nội bộ MVP**). State that it is not an electronic invoice or a legally compliant tax invoice. This terminology change does not add tax fields, tax calculations, fiscal numbering, external integrations, or new routes, and does not change what payment event issues the record.

## Documentation updates

As part of implementation, align the order-history and receipt documentation with this design:

- Update the admin order-processing design so historical order detail uses snapshot values and so its current inventory statements match the approved no-inventory behavior.
- Update the customer order-placement design to document transactional snapshot creation and the customer order-detail fields.
- Clarify the internal invoice design and backend README that the existing invoice API is an MVP receipt and not a tax invoice.
- Update the corrected ERD to include the three snapshot columns on `Order_Detail`; do not add any inventory ledger or stock balance.

## Verification expectations

- Migration backfills existing detail rows and enforces the required product-name snapshot.
- A new order captures product name, size, and color from the catalog rows read within order creation.
- After changing a product name and variant size/color, both customer and admin order-detail APIs still return the original order snapshots.
- A new order made after those catalog changes captures the updated values.
- Existing order amounts, voucher behavior, payment processing, receipt issuance, authorization, and order status workflows remain unchanged.
- Migration rollback removes only the new columns, intentionally discards their snapshot values, and keeps all order and detail rows and amounts intact.
- All full-order customer responses expose `productName`, `size`, and `color` without leaking snapshot storage property names; customer order-list responses remain unchanged.
- Backend automated tests run against the designated disposable test database, not the local development database.

## Out of scope

- Restoring historical catalog values that were overwritten before snapshot fields existed.
- Snapshots of product description, brand, photos, or mutable customer/catalog metadata beyond product name, size, and color.
- Renaming the invoice table/entity/routes to `receipt`.
- Tax compliance, electronic invoice issuance, tax calculation, refunds, or external invoicing providers.
- Payment provider, voucher, inventory, packing, frontend, and order-state behavior changes.
