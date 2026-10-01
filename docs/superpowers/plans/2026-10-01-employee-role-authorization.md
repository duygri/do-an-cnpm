# Employee Role Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce employee access by role, add admin APIs to provision employees and assign roles, and keep customer/public access boundaries unchanged.

**Architecture:** Add a persisted employee `role` distinct from the descriptive `position`. `EmployeeJwtGuard` authenticates active employees and loads their current role from PostgreSQL; a fail-closed `EmployeeRolesGuard` enforces explicit controller metadata. Add `/admin/employees` for admin-only staff management, and preserve all current storefront/customer/business URLs.

**Tech Stack:** NestJS 11, TypeScript, PostgreSQL, TypeORM, JWT, Node.js built-in test runner, existing `pg` test dependency.

---

## File map

**Create**

- `backend/src/employees/employee-role.ts` — supported role constants and TypeScript union.
- `backend/src/auth/employee-roles.decorator.ts` — typed NestJS metadata decorator.
- `backend/src/auth/employee-roles.guard.ts` — fail-closed role check with admin override.
- `backend/src/employees/admin-employees.controller.ts` — admin employee HTTP routes.
- `backend/src/employees/admin-employees.service.ts` — employee provisioning, listing, role/status updates, and last-admin invariant.
- `backend/src/employees/employees.module.ts` — registers the employee admin controller/service and repository.
- `backend/src/employees/dto/list-employees.dto.ts` — bounded list pagination.
- `backend/src/employees/dto/create-employee.dto.ts` — validated employee creation request.
- `backend/src/employees/dto/update-employee-access.dto.ts` — role/status-only update request.
- `backend/src/database/migrations/1790830000000-add-employee-role.ts` — role column, check constraint/index, safe backfill, and down migration.
- `backend/test/employee-role-migration.e2e.mjs` — PostgreSQL migration backfill test using a disposable schema in the `_test` database.

**Modify**

- `backend/src/employees/entities/employee.entity.ts` — persist the role.
- `backend/src/auth/auth.types.ts`, `backend/src/auth/authenticated-request.ts` — expose typed employee role in the authenticated request/profile.
- `backend/src/auth/auth.service.ts` — include role in employee login response, but not as an authorization claim.
- `backend/src/auth/employee-jwt.guard.ts` — load current role from the database with the active employee.
- `backend/src/auth/auth.module.ts` — register/export the roles guard.
- `backend/src/app.module.ts` — register the employee administration module.
- `backend/src/database/create-admin.ts` — bootstrap explicit `admin` role.
- `backend/src/catalog/categories.controller.ts`, `backend/src/catalog/products.controller.ts`, `backend/src/catalog/product-variants.controller.ts` — require `catalog_manager` or admin.
- `backend/src/promotions/promotions.controller.ts` — require `promotion_manager` or admin.
- `backend/src/orders/admin-orders.controller.ts`, `backend/src/invoices/invoices.controller.ts` — require `order_staff` or admin on employee routes; retain customer invoice guard unchanged.
- `backend/src/suppliers/suppliers.controller.ts`, `backend/src/imports/imports.controller.ts` — require `purchasing_staff` or admin.
- `backend/test/sales-flows.e2e.mjs` — add role fixtures, route matrix, employee management and lockout regression tests.
- `backend/package.json` — include the migration test in the serialized E2E command.
- `docs/functional-requirements.md`, `backend/README.md`, and the affected auth, catalog, promotion, order, COD, supplier/import and invoice design documents — replace the all-active-employees policy with the approved role matrix.

Do not change customer controllers, storefront access, payment business logic, PayOS webhook signature verification, or frontend files.

## Task 1: Add the employee role schema and safe migration

**Files:** role type, employee entity, migration, migration E2E test, bootstrap command.

- [ ] **Step 1: Write the failing migration backfill test.**

Create `backend/test/employee-role-migration.e2e.mjs`. Connect only with `TEST_DATABASE_URL`, verify its database name ends in `_test`, create a uniquely named temporary schema, and create a minimal legacy `employee` table with the existing columns but no role. Insert one row with `position = ' Admin '` and one with another position. Load the compiled new migration and execute `up` with a TypeORM `QueryRunner` whose `search_path` points to the temporary schema. Assert the first row receives role `admin`, the second `unassigned`, and an unknown role violates the database check constraint. Drop the temporary schema in `finally`.

- [ ] **Step 2: Run the focused migration test and confirm the expected failure.**

From `backend`, run `npm run build`, then `node --test test/employee-role-migration.e2e.mjs` with `TEST_DATABASE_URL` set to a dedicated database ending in `_test`.

Expected: it fails because the role migration does not exist yet. It must not connect to the regular `DATABASE_URL` or a database without the `_test` suffix.

- [ ] **Step 3: Implement the role type, entity column, and reversible migration.**

Use the supported values `admin`, `catalog_manager`, `promotion_manager`, `order_staff`, `purchasing_staff`, and `unassigned`. Add a non-null `varchar` column defaulting to `unassigned`, a check constraint over exactly those values, and an index on `(role, status)`. Backfill case-insensitive trimmed `position = 'admin'` to `admin`; map every other existing position to `unassigned`. Implement `down` to remove the index, check constraint, and column in dependency order.

- [ ] **Step 4: Make the admin bootstrap assign the role explicitly.**

Update `backend/src/database/create-admin.ts` to set `role: 'admin'` independently from `position: 'admin'`.

- [ ] **Step 5: Run migration and backend tests.**

Run the focused migration test, then `npm test` from `backend` with `TEST_DATABASE_URL` pointing to the dedicated `_test` database.

Expected: the migration test passes; the existing sales and PayOS suites remain green after their fixtures migrate.

- [ ] **Step 6: Register the focused migration test in the serialized E2E suite.**

Update `backend/package.json` so `test:e2e` runs `test/employee-role-migration.e2e.mjs` before the HTTP sales and fake PayOS suites, retaining `--test-concurrency=1`.

- [ ] **Step 7: Commit only this task's files.**

```powershell
git add backend/src/employees/employee-role.ts backend/src/employees/entities/employee.entity.ts backend/src/database/migrations/1790830000000-add-employee-role.ts backend/src/database/create-admin.ts backend/test/employee-role-migration.e2e.mjs backend/package.json
git commit -m "feat: add employee role schema"
```

## Task 2: Load employee roles and add a fail-closed roles guard

**Files:** employee role type, auth types/request/service/guard/module, roles decorator/guard, HTTP E2E test.

- [ ] **Step 1: Add failing profile tests for assigned and unassigned employees.**

Extend `backend/test/sales-flows.e2e.mjs` so employee fixtures accept an explicit role. Assert login and `GET /auth/employee/profile` return the database role for both an admin and an unassigned employee.

- [ ] **Step 2: Run the focused authorization suite and confirm the expected failure.**

Run `npm test` with the isolated `_test` database.

Expected: compilation or assertions fail because the employee response/request does not yet contain a typed role.

- [ ] **Step 3: Add the shared role metadata decorator and guard.**

Create `@EmployeeRoles(...roles)` backed by NestJS `SetMetadata`. `EmployeeRolesGuard` must use `Reflector.getAllAndOverride` for handler/class metadata and return `false` when no role metadata exists. Permit `admin` or an exact declared role; deny `unassigned` on any business route.

- [ ] **Step 4: Load role from PostgreSQL on every employee request.**

Extend the employee request/profile type. Update `EmployeeJwtGuard` to select `role` together with the existing safe employee fields. Update `AuthService.signIn` to return the role in the employee profile while continuing to sign only `sub` and `actorType` as authorization-relevant JWT claims.

- [ ] **Step 5: Register and export the guard, then verify the tests.**

Register `EmployeeRolesGuard` in `AuthModule`; run `npm test` and `npm run lint`.

Expected: employee profiles expose roles, invalid/inactive tokens remain `401`, and all current behavior still compiles before controller restrictions are added.

- [ ] **Step 6: Commit only this task's files.**

```powershell
git add backend/src/employees/employee-role.ts backend/src/auth/auth.types.ts backend/src/auth/authenticated-request.ts backend/src/auth/auth.service.ts backend/src/auth/employee-jwt.guard.ts backend/src/auth/employee-roles.decorator.ts backend/src/auth/employee-roles.guard.ts backend/src/auth/auth.module.ts backend/test/sales-flows.e2e.mjs
git commit -m "feat: add employee role authorization guard"
```

## Task 3: Apply the approved role matrix to business modules

**Files:** employee-protected controllers and `backend/test/sales-flows.e2e.mjs`.

- [ ] **Step 1: Write table-driven role access tests for every employee controller.**

Create active employees for all six role values and log each in through `/auth/employee/login`. Exercise one representative read endpoint for every employee-protected controller and assert: `admin` succeeds everywhere; each specialist succeeds only for its assigned module; `unassigned` receives `403` on business APIs; a customer token receives `401`. Cover `/categories`, `/products`, `/products/:productId/variants`, `/promotions`, `/promotions/:promotionId/vouchers`, `/admin/orders`, `/suppliers`, and `/imports`. Extend the invoice flow to assert `order_staff` can read the issued admin invoice while an unrelated specialist receives `403`; retain the existing customer's own invoice `200` and employee/customer cross-actor denials. Also assert anonymous `GET /store/products` remains public.

- [ ] **Step 2: Run the focused authorization tests and confirm they fail.**

Run `npm test` against the isolated `_test` database.

Expected: active non-admin employee tokens still receive `200` on modules outside their role, proving the guard metadata has not been applied.

- [ ] **Step 3: Apply role metadata and guards by module.**

Use `@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)` and controller-level `@EmployeeRoles` for catalog, promotions, suppliers/imports, admin orders, and the admin invoice controller. Use `catalog_manager`, `promotion_manager`, `purchasing_staff`, and `order_staff` respectively. Keep `admin` as the global override in the guard. Leave storefront, customer invoice controller, customer orders, employee profile, and signed PayOS webhook under their existing policies.

- [ ] **Step 4: Verify every allowed and denied boundary.**

Run `npm test` and `git diff --check`.

Expected: specialist route matrix matches the design; denied active employee tokens return `403`; wrong actor, inactive, and invalid tokens return `401`; `order_staff` and a customer's owner-only invoice access work; public storefront and webhook tests remain green.

- [ ] **Step 5: Commit only this task's files.**

```powershell
git add backend/src/catalog/categories.controller.ts backend/src/catalog/products.controller.ts backend/src/catalog/product-variants.controller.ts backend/src/promotions/promotions.controller.ts backend/src/orders/admin-orders.controller.ts backend/src/invoices/invoices.controller.ts backend/src/suppliers/suppliers.controller.ts backend/src/imports/imports.controller.ts backend/test/sales-flows.e2e.mjs
git commit -m "feat: restrict employee APIs by role"
```

## Task 4: Add admin-only employee provisioning and role management

**Files:** employee admin module/controller/service/DTOs, `app.module.ts`, HTTP E2E tests.

- [ ] **Step 1: Write failing HTTP tests for the management API.**

In `backend/test/sales-flows.e2e.mjs`, test admin-only `GET /admin/employees`, `POST /admin/employees`, and `PATCH /admin/employees/:employeeId`; assert every non-admin role receives `403` on each endpoint. Cover duplicate normalized email (`409`), invalid role/status (`400`), role/status changes taking effect on the same still-valid token, deactivation returning `401` on the next request, and absence of `passwordHash` from list/create/update responses.

- [ ] **Step 2: Write failing lockout and concurrent-last-admin tests.**

Assert an administrator cannot demote/deactivate their own account, cannot remove the last active administrator, and two concurrent administrators cannot demote each other and leave no active admin. For the concurrent case, submit both PATCH requests before awaiting either response; exactly one mutation must succeed and the database must still contain one active administrator afterward.

For the concurrent case, allow the losing request to receive `403` if its
employee guard runs after the first demotion, or `409` if both requests passed
authorization before the serialized service mutation. Assert exactly one
mutation succeeds and a database query shows exactly one active administrator
after both requests finish.

- [ ] **Step 3: Run the focused tests and confirm expected failures.**

Run `npm test` with the isolated `_test` database.

Expected: `/admin/employees` returns `404` and the last-admin/concurrency assertions fail before implementation.

- [ ] **Step 4: Implement safe employee projections and the admin controller/service.**

Create the `employees` feature module and register it in `AppModule`. Import `Employee`, `AuthModule`, and the password service. Implement bounded pagination and explicit response projections containing only `employeeId`, `name`, `email`, `phone`, `position`, `role`, and `status`. Normalize email with trim/lowercase; validate password length 12–128; hash using `PasswordService`; accept no client-controlled ID or hash.

- [ ] **Step 5: Protect role/status mutations atomically.**

For every role/status mutation, start a PostgreSQL transaction, acquire the same transaction-scoped advisory lock, then read the active-admin count and update. Reject self-demotion/deactivation and any change that would leave zero active admins with `409 Conflict`. Keep role/status values constrained by DTO validation and the database check constraint.

- [ ] **Step 6: Run the full automated suite and lint.**

Run `npm test` and `npm run lint`.

Expected: all employee-management, role-boundary, sales-flow, and fake PayOS-provider tests pass; lint exits successfully.

- [ ] **Step 7: Commit only this task's files.**

```powershell
git add backend/src/employees backend/src/app.module.ts backend/test/sales-flows.e2e.mjs
git commit -m "feat: add admin employee role management"
```

## Task 5: Synchronize authorization documentation and finish verification

**Files:** functional requirements, backend README, and affected design documents.

- [ ] **Step 1: Update the functional requirements and authorization matrix.**

Replace the single “Nhân viên” permission column in `docs/functional-requirements.md` with the approved employee roles and mark the exact domain/API access from the design. Document `403` for an authenticated employee lacking the required role and the `unassigned` profile-only behavior.

- [ ] **Step 2: Update API setup documentation.**

Update `backend/README.md` role list, route-to-role mapping, admin employee endpoints, bootstrap role behavior, and the exact HTTP difference between `401` and `403`. Preserve the isolated `_test` database warning.

- [ ] **Step 3: Update the affected domain specifications.**

Update the existing employee-access statements in the customer/storefront, catalog, supplier/import, admin order, promotion/voucher, COD, PayOS, and invoice specs to point to the role matrix. Do not rewrite unrelated business rules or change the approved payment, voucher, invoice, packing, or no-inventory behavior.

- [ ] **Step 4: Run final verification and inspect the patch.**

From `backend`, run `npm test` and `npm run lint` with `TEST_DATABASE_URL` targeting the dedicated `_test` database. From the repository root run `git diff --check` and inspect `git status --short` to ensure only intended RBAC files are included.

Expected: all tests pass, lint and diff checks pass, and no frontend files or `.env` secrets are included.

- [ ] **Step 5: Commit only documentation changes from this task.**

```powershell
git add docs/functional-requirements.md backend/README.md docs/superpowers/specs/2026-09-28-customer-storefront-design.md docs/superpowers/specs/2026-09-27-supplier-import-inventory-design.md docs/superpowers/specs/2026-09-28-admin-order-processing-design.md docs/superpowers/specs/2026-09-29-promotions-vouchers-design.md docs/superpowers/specs/2026-09-29-cod-payment-design.md docs/superpowers/specs/2026-09-30-payos-payment-design.md docs/superpowers/specs/2026-10-01-internal-invoices-design.md
git commit -m "docs: document employee role access matrix"
```

## Execution notes

- Follow `superpowers:test-driven-development` for each behavior: add the failing test, run it to observe the expected failure, implement the smallest change, and rerun it.
- Follow `superpowers:verification-before-completion` before reporting completion.
- Execute the `_test` database only. `npm test` resets that database before migrations; never point `TEST_DATABASE_URL` at the development database.
- Keep commits scoped to the exact files listed for that task; preserve existing unrelated working-tree changes.
- Before staging, inspect `git status --short`; for any task file that already contains unrelated changes, stage only the task's hunks rather than committing the entire pre-existing diff.
- Do not edit frontend files or call real PayOS endpoints.
