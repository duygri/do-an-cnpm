# Customer Accounts and Public Storefront Design

## Goal

Add customer registration, login, profile access, and public product browsing while preserving employee-only access to the existing administration APIs.

## Scope

- Customers can register with a name, email, and password. Date of birth, phone, address, and gender are optional profile fields.
- Customers can log in, read their profile, and update profile fields without changing their email or password through the profile endpoint.
- Public storefront routes list categories that contain active products, search and filter active products with pagination, and read one active product with its variants. The existing variant schema has no status field, so every variant of an active product is included.
- Employee catalog administration routes require `catalog_manager` or `admin`; active `unassigned` employees can only read their own employee profile. The role list, other employee-domain mappings, and `401`/`403` distinction are maintained in the [employee role authorization design](2026-10-01-employee-role-authorization-design.md).

## Architecture

- Add a customer entity and migration with a unique normalized email, password hash, and the profile columns already represented by the ERD.
- Implement customer account endpoints as a separate customer feature. Reuse the existing scrypt password service and configured JWT signing service.
- Add an `actorType` claim to employee and customer access tokens. The employee guard accepts an untyped legacy employee token only until its existing 15-minute expiry, but rejects `actorType: customer`; the customer guard requires `actorType: customer`. This prevents cross-account use when numeric IDs happen to match while avoiding forced logout during rollout.
- Add separate storefront read routes rather than making employee administration routes public. Storefront queries only return active products. All variants of an active product are returned and included when calculating its lowest variant price because the existing variant schema has no status field. Product search is case-insensitive and results have stable product-ID ordering.
- Registration and login normalize email by trimming and lowercasing. Registration rejects duplicate email with `409`; invalid credentials return the same `401` response. Passwords are never included in API responses.

## API

- `POST /auth/customer/register`: create account and return a customer profile plus a 15-minute bearer token.
- `POST /auth/customer/login`: authenticate and return the same response shape.
- `GET /auth/customer/profile`: return the authenticated customer's safe profile.
- `PATCH /auth/customer/profile`: update supplied name, date of birth, phone, address, and/or gender fields. Omitted fields are unchanged; explicit `null` clears nullable fields. Blank optional phone, address, and gender strings are trimmed and stored as `null`; name must remain nonblank. Email and password are not patchable here.
- `GET /store/categories`: list categories with at least one active product. Each item has `categoryId`, `name`, and `description`.
- `GET /store/products?page=1&limit=20&q=shirt&categoryId=1`: return active product summaries and pagination metadata; page defaults to 1 and limit to 20, with a maximum limit of 100. Each summary has `productId`, `name`, `description`, `brand`, nested `category` (`categoryId`, `name`), and `priceFrom` (minimum price across all variants or `null` when there are none). The page response has `items`, `page`, `limit`, and `total`.
- `GET /store/products/:productId`: return an active product with `productId`, `name`, `description`, `brand`, nested `category` (`categoryId`, `name`, `description`), and all its variants (`variantId`, `size`, `color`, `price`). Inactive or unknown products return `404`.

Customer profile objects contain `customerId`, `name`, `email`, `dateOfBirth`, `phone`, `address`, and `gender`; auth responses add `access_token`, `token_type: "Bearer"`, and `expires_in`. No response contains `passwordHash`.

Registration requires a valid email and a 12–128 character password, following the existing admin-password policy. Optional date of birth is an ISO date (`YYYY-MM-DD`). The public API does not expose password hashes, employee data, inventory ledger rows, or administration write operations.

## Non-goals

- Orders, cart, payment, promotion application, password reset, email verification, refresh tokens, customer account deactivation, and inventory reservation or deduction.
- Adding product images or changing the supplied ERD beyond the customer table fields already shown.

## Schema and rollout

Add a new `customer` table in a forward-only TypeORM migration with an integer generated primary key, name, unique email, nullable date/phone/address/gender fields, and password hash. Keep `synchronize` disabled and leave all existing migrations unchanged. Run the migration against the configured local PostgreSQL database after the implementation is complete.

## Verification

Use the existing TypeScript build and lint commands and inspect the migration status after applying the migration. Do not add or run test suites for this implementation.
