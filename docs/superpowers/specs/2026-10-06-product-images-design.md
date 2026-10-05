# Product Images Design

## Goal

Persist multiple image URL records per product and expose them from the existing admin catalog and public storefront APIs. The current FE already submits `images` and consumes `ProductImage`, `primaryImageUrl`, and product-detail `images`; the backend must match that contract without changing the FE.

## Approved behavior

- Use a separate `product_image` table with `product_image_id`, `product_id`, `image_url`, `alt_text`, `sort_order`, and `is_primary`.
- A product has zero or more images. Deleting a product cascades to its image records.
- Accept HTTPS URLs only; no upload/storage provider is part of this MVP.
- Limit one product to 12 images. `altText` is optional and at most 200 characters. `sortOrder` is a nonnegative integer.
- At most one image may be primary. If a nonempty image list has no primary selected, choose the lowest `sortOrder` (stable input order for ties). Multiple requested primary images are invalid.
- Admin product create accepts optional `images`; update with omitted `images` preserves current images, an array replaces the collection atomically, and `[]` clears it.
- Product reads return ordered `images`. Storefront product summaries expose nullable `primaryImageUrl`; product detail returns the complete ordered image list.
- Image records are managed within product create/update; no standalone upload endpoint or FE changes are included.
- Do not automatically attach sample URLs to the user's existing catalog during migration. Demo images can be entered through the existing FE URL editor; E2E uses synthetic HTTPS URLs.

## Persistence and transaction rules

- Migration creates `product_image`, a cascading FK to `product`, a nonnegative sort check, a one-primary-per-product partial unique index, and a URL scheme check.
- Entity relation loads images explicitly; do not enable eager loading across unrelated order/import flows.
- Product create/update and image replacement run in one database transaction. Validation happens before destructive replacement; a failure leaves the old image list intact.
- Storefront queries continue filtering active products; adding a left join must not change pagination counts or duplicate product rows.

## Validation

- Reject more than 12 images, invalid/non-HTTPS URLs, invalid URL lengths, alt text over 200 characters, negative/fractional sort values, multiple primaries, and null `images` on patch.
- Do not fetch user URLs from the backend.

## Verification

E2E against only a dedicated `*_test` PostgreSQL database covers migration constraints/cascade, admin create/list/detail/update semantics, primary fallback, validation failures, storefront summary/detail image payloads, and inactive product visibility. Existing employee role, order, voucher, invoice, and fake PayOS suites remain green.
