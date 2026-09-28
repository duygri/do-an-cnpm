# Customer Accounts and Public Storefront Design

## Goal

Add customer registration, login, profile access, and public product browsing while preserving employee-only access to the existing administration APIs.

## Scope

- Customers can register with a name, email, and password. Date of birth, phone, address, and gender are optional profile fields.
- Customers can log in, read their profile, and update profile fields without changing their email or password through the profile endpoint.
- Public storefront routes list categories that contain active products, search and filter active products with pagination, and read one active product with its active variants.
- The existing employee catalog routes remain employee-authenticated and retain their current behavior.

## Architecture

- Add a customer entity and migration with a unique normalized email, password hash, and the profile columns already represented by the ERD.
- Implement customer account endpoints as a separate customer feature. Reuse the existing scrypt password service and configured JWT signing service.
- Add an `actorType` claim to employee and customer access tokens. Each guard accepts only its own actor type, preventing a customer token from being accepted as an employee token when numeric IDs happen to match.
- Add separate storefront read routes rather than making employee administration routes public. Storefront queries only return active products and their variants; product search is case-insensitive and results have stable product-ID ordering.
- Registration and login normalize email by trimming and lowercasing. Registration rejects duplicate email with `409`; invalid credentials return the same `401` response. Passwords are never included in API responses.

## API

- `POST /auth/customer/register`: create account and return a customer profile plus a 15-minute bearer token.
- `POST /auth/customer/login`: authenticate and return the same response shape.
- `GET /auth/customer/profile`: return the authenticated customer's safe profile.
- `PATCH /auth/customer/profile`: update supplied name, date of birth, phone, address, and/or gender fields.
- `GET /store/categories`: list categories with at least one active product.
- `GET /store/products?page=1&limit=20&q=shirt&categoryId=1`: return active product summaries and pagination metadata; page defaults to 1 and limit to 20, with a maximum limit of 100.
- `GET /store/products/:productId`: return an active product, its category, and its variants. Inactive or unknown products return `404`.

Registration requires a valid email and a 12–128 character password, following the existing admin-password policy. Optional date of birth is an ISO date (`YYYY-MM-DD`). The public API does not expose password hashes, employee data, inventory ledger rows, or administration write operations.

## Non-goals

- Orders, cart, payment, promotion application, password reset, email verification, refresh tokens, customer account deactivation, and inventory reservation or deduction.
- Adding product images or changing the supplied ERD beyond the customer table fields already shown.

## Schema and rollout

Add a new `customer` table in a forward-only TypeORM migration with an integer generated primary key, name, unique email, nullable date/phone/address/gender fields, and password hash. Keep `synchronize` disabled and leave all existing migrations unchanged. Run the migration against the configured local PostgreSQL database after the implementation is complete.

## Verification

Use the existing TypeScript build and lint commands and inspect the migration status after applying the migration. Do not add or run test suites for this implementation.
