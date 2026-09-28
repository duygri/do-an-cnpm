# Customer Accounts and Public Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer registration, login, profile access, and public storefront read APIs without weakening employee administration routes.

**Architecture:** Add a customer feature module with a PostgreSQL entity, a scrypt-backed account service, and a customer-only JWT guard. Add separate unauthenticated `/store` read routes in the catalog module. Token actor types separate customer and employee identities while allowing already-issued employee tokens to expire naturally.

**Tech Stack:** NestJS 11, TypeScript, TypeORM, PostgreSQL, class-validator, existing JwtModule, existing scrypt PasswordService.

---

### Task 1: Add customer persistence and actor-aware JWTs

**Files:**
- Create: `backend/src/customers/entities/customer.entity.ts`
- Create: `backend/src/database/migrations/1790611200000-create-customer.ts`
- Modify: `backend/src/auth/auth.types.ts`
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/employee-jwt.guard.ts`
- Modify: `backend/src/auth/auth.module.ts`

- [x] Create `customer` entity fields: generated integer `customerId`; `name varchar(120)`; normalized unique `email varchar(254)`; nullable `dateOfBirth date`, `phone varchar(30)`, `address text`, `gender varchar(30)`; and `passwordHash varchar(255)`. Name the unique index `UQ_customer_email` in both TypeORM metadata and migration.
- [x] Create a new migration after the existing supplier/import/inventory migration. Create the customer table and unique email index; `down` drops only the customer table.
- [x] Extend `AccessTokenPayload` with optional `actorType: 'employee' | 'customer'` so pre-upgrade employee tokens without the claim remain representable.
- [x] Include `actorType: 'employee'` in newly issued employee tokens. Update `EmployeeJwtGuard` to reject any non-employee actor type while accepting an absent actor type until the existing 15-minute expiry.
- [x] Export `JwtModule` and `PasswordService` from `AuthModule` so `CustomersModule` can use the already-configured signer and existing scrypt implementation.

### Task 2: Implement customer account APIs

**Files:**
- Create: `backend/src/customers/dto/register-customer.dto.ts`
- Create: `backend/src/customers/dto/login-customer.dto.ts`
- Create: `backend/src/customers/dto/update-customer-profile.dto.ts`
- Create: `backend/src/customers/customer-profile.ts`
- Create: `backend/src/customers/customer-authenticated-request.ts`
- Create: `backend/src/customers/customer-jwt.guard.ts`
- Create: `backend/src/customers/customers.service.ts`
- Create: `backend/src/customers/customers.controller.ts`
- Create: `backend/src/customers/customers.module.ts`
- Modify: `backend/src/app.module.ts`

- [x] Validate registration fields: trimmed nonblank name, normalized valid email, password length 12–128, ISO date-only optional birth date, and bounded optional phone/address/gender values.
- [x] Implement `POST /auth/customer/register` and `POST /auth/customer/login`. Trim and lowercase email on both routes, hash with `PasswordService`, sign 15-minute tokens with `actorType: 'customer'`, map duplicate email to `409`, and use one generic `401` for invalid login credentials. Return auth responses with `access_token`, `token_type: "Bearer"`, `expires_in`, and `customer` containing `customerId`, `name`, `email`, `dateOfBirth`, `phone`, `address`, and `gender`.
- [x] Implement `CustomerJwtGuard`: require a valid bearer JWT with `actorType: 'customer'`, a positive integer subject, and an existing customer. Attach only safe customer fields to the request.
- [x] Implement `GET /auth/customer/profile` and `PATCH /auth/customer/profile`. The profile response contains only `customerId`, `name`, `email`, `dateOfBirth`, `phone`, `address`, and `gender`. Omitted patch fields remain unchanged; `null` clears nullable fields; blank optional text is trimmed and stored as `null`; name must remain nonblank. Do not accept email/password updates here.
- [x] Register `CustomersModule` in `AppModule`. Do not return or select `passwordHash` in profile responses.

### Task 3: Add public storefront reads

**Files:**
- Create: `backend/src/catalog/dto/get-store-products.dto.ts`
- Create: `backend/src/catalog/storefront.service.ts`
- Create: `backend/src/catalog/storefront.controller.ts`
- Modify: `backend/src/catalog/catalog.module.ts`

- [x] Add `GET /store/categories`, returning only categories with at least one active product and only `categoryId`, `name`, and `description`.
- [x] Add `GET /store/products` query validation: `page` defaults to 1, `limit` defaults to 20 and caps at 100, optional `q` is bounded and case-insensitive, and optional `categoryId` is a positive integer.
- [x] Return only active products with stable `productId` ordering and pagination metadata `{ items, page, limit, total }`. Each summary item contains `productId`, `name`, `description`, `brand`, nested `category` with `categoryId` and `name`, and `priceFrom` (minimum price across all variants as a decimal string or `null` when there are none).
- [x] Add `GET /store/products/:productId` returning only an active product with `productId`, `name`, `description`, `brand`, nested `category` with `categoryId`, `name`, and `description`, and all variants with `variantId`, `size`, `color`, and `price`, ordered by `variantId`. The schema has no variant status, so do not filter variants. Unknown and inactive products return `404`.
- [x] Keep the existing `/categories`, `/products`, and product-variant administration controllers protected with `EmployeeJwtGuard`; do not include inventory movement or password data in storefront responses.

### Task 4: Document customer and storefront APIs

**Files:**
- Modify: `backend/README.md`

- [x] Document registration/login/profile payloads, bearer-token use, the separate customer actor type, and the brief legacy employee-token compatibility window.
- [x] Document storefront filters, pagination defaults/cap, active-product behavior, response fields, and that ordering, stock deduction, and inventory availability are outside this phase.

### Task 5: Verify and apply the migration

**Files:**
- Review: all changed files and migration.

- [x] Run `npm run format`, `npm run build`, and `npm run lint` from `backend/`.
- [x] Run `git diff --check` and inspect entity metadata against the migration and the approved API contract.
- [x] Run `npm run db:migrate` and `npm run db:migrations` using the configured local PostgreSQL database; confirm the customer migration is applied and do not print or commit `.env` contents.

No tests are added or run in this plan.
