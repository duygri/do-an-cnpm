# Product Images Backend Implementation Plan

> Follow `superpowers:test-driven-development`; backend only. The UI contract already exists in frontend code. Keep all unrelated dirty work untouched and use only `TEST_DATABASE_URL` pointing to the dedicated `sales_system_codex_work_test` database for tests.

**Goal:** Implement the approved `Product_Image` table and integrate images with existing product CRUD and storefront APIs.

**Architecture:** TypeORM `ProductImage` entity and migration; nested validated image input on product create/update; replace image records transactionally; return ordered product images and storefront primary image URL.

## Task 1 — Schema and migration

1. Write an isolated-schema PostgreSQL migration test: create a temporary legacy `product` table, run the new migration, assert columns, FK cascade, HTTPS/sort checks, one-primary partial unique index, and rollback; refuse a test URL without `_test` suffix.
2. Confirm the test fails before implementation.
3. Add the ProductImage entity and `Product.images` inverse relation; match the already-applied `CreateProductImages1790850000000` base migration and add `1790860000000-add-product-image-https-check.ts` so both fresh and existing databases gain the HTTPS constraint.
4. Run focused migration test, build, then the serialized backend suite on the isolated test DB.

Files: `backend/src/catalog/entities/product-image.entity.ts`, `product.entity.ts`, migration, migration test, and `backend/package.json` test registration (additive only; keep its pre-existing user test scripts).

## Task 2 — Admin product image CRUD contract

1. Add failing HTTP tests for create with multiple images, fallback primary choice, detail/list response ordering, update replace, omitted-image preservation, explicit empty-array clear, multiple-primary rejection, invalid URLs/alt text/sort order/count, and transaction rollback.
2. Add nested DTO validation and image normalization (default sortOrder to input index; choose lowest sortOrder primary when none supplied; reject multiple primaries).
3. Refactor product create/update to use a single TypeORM transaction for product plus images. Validate before deleting old images. Keep existing category validation and CRUD behavior intact.
4. Load ordered images for admin `GET /products`, `GET /products/:productId`, and create/update responses.

Files: product image DTO, create/update DTOs, products service/controller if needed, catalog module, `sales-flows.e2e.mjs`.

## Task 3 — Storefront image API

1. Add failing tests that assert public `GET /store/products` returns nullable `primaryImageUrl`; `GET /store/products/:productId` returns ordered image records; inactive products remain hidden.
2. Extend the summary SQL with a left join to the primary image while preserving one-row-per-product pagination and counts. Extend detail mapping with the ordered image projection.
3. Run the full backend suite and lint. Inspect query behavior for products with zero/one/multiple image rows.

Files: `storefront.service.ts`, E2E tests.

## Task 4 — Final review and docs

1. Update backend README and functional requirements with Product_Image fields, HTTPS URL contract, primary fallback, and product/storefront API response fields; do not change FE.
2. Run `npm test` using only `sales_system_codex_work_test`, `npm run lint`, and `git diff --check`.
3. Review status/diff to ensure no `.env`, unrelated frontend, or user changes are staged/committed.
