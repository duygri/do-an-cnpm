# Admin/Manager Role Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse employee authorization to `admin` and `manager`, then serve both roles through one employee management portal.

**Architecture:** Add a forward-only role consolidation migration, update backend authorization to allow `manager` across operational modules while preserving admin-only employee management, and fold the staff UI into the existing Admin Panel. Keep the customer storefront separate and synchronize operator documentation.

**Tech Stack:** NestJS 11, TypeScript, PostgreSQL, TypeORM, React 18, React Router 6, Vite, Vitest, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-manager-roles-design.md`

## Global Constraints

- `employee.role` accepts exactly `admin` and `manager`.
- The existing `employee.status` (`active` / `inactive`) remains the account lock mechanism. Do not add a duplicate `is_active` field.
- Existing specialist roles map to `manager`; existing `unassigned` accounts map to `manager` and active accounts are made inactive during migration.
- `manager` can use operational modules for catalog, promotions, orders, suppliers, and imports; employee account management is admin-only.
- Keep the storefront at port `5173` and the single employee management portal at port `5175`; remove the separate staff Vite target at port `5174`.
- The backend remains the authorization boundary; route and menu filtering are only frontend usability controls.
- Customer JWT routes, customer-facing behavior, PayOS webhook verification, payment logic, and invoice behavior remain unchanged.
- Revenue statistics are designed and implemented separately by `docs/superpowers/specs/2026-10-06-admin-revenue-statistics-design.md` and its plan.

## Review Focus

1. Existing active `unassigned` employees must not gain access after migration — cover in Task 1 migration test.
2. Every former specialist maps to a manager who can use every operational API but not employee administration — cover in Tasks 1 and 2.
3. Admin must retain all operational APIs and admin-only employee management — cover in Task 2.
4. A manager must be able to log in through the unified portal, see every operational module, and be denied employee routes — cover in Task 3.
5. Customer/storefront isolation and the `5173` user portal must remain unchanged while `5174` disappears — cover in Task 3 smoke/build checks.

---

### Task 1: Collapse existing employee roles in a forward migration

**Files:**
- Create: `backend/src/database/migrations/1790840000000-consolidate-employee-roles.ts`
- Create: `backend/test/employee-role-consolidation-migration.e2e.mjs`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: the schema produced by `1790830000000-add-employee-role.ts`.
- Produces: role values restricted to `admin` / `manager`, with `manager` as the column default and `IDX_employee_role_status` preserved.

- [x] **Step 1: Write the migration test first.** Create a temporary schema only in `TEST_DATABASE_URL` ending in `_test`; create the old role schema and insert all six current role values, including active and inactive `unassigned` rows. Run the new migration and assert admins stay `admin`, specialist roles become `manager`, unassigned rows become inactive `manager`, the default becomes `manager`, and the check constraint rejects other values. Run `down` and assert all `manager` values become `unassigned` and statuses are retained.
- [x] **Step 2: Run the focused test and observe the expected failure.** From `backend`, run `npm run build` and `node --test test/employee-role-consolidation-migration.e2e.mjs` with the isolated `_test` database. It must fail because the new migration does not yet exist.
- [x] **Step 3: Implement the reversible migration.** Drop the existing role check, map values, deactivate only active `unassigned` rows, set the default, add the two-value check, and leave the role/status index intact. On rollback map `manager` to `unassigned`, restore the old default and old six-value constraint, and preserve account status.
- [x] **Step 4: Register the focused migration test.** Add it to the serialized `backend` `test:e2e` command before HTTP flows.
- [x] **Step 5: Run the focused migration test and confirm it passes.** Use only the `_test` database.
- [x] **Step 6: Commit this task.** `git add backend/src/database/migrations/1790840000000-consolidate-employee-roles.ts backend/test/employee-role-consolidation-migration.e2e.mjs backend/package.json`; commit as `feat: consolidate employee roles`.

### Task 2: Enforce the two-role backend model

**Files:**
- Modify: `backend/src/employees/employee-role.ts`
- Modify: `backend/src/employees/entities/employee.entity.ts`
- Format: `backend/src/database/migrations/1790840000000-consolidate-employee-roles.ts` (the newly added Task 1 migration currently fails repository Prettier lint)
- Modify: `backend/src/catalog/categories.controller.ts`, `backend/src/catalog/products.controller.ts`, `backend/src/catalog/product-variants.controller.ts`, `backend/src/promotions/promotions.controller.ts`, `backend/src/orders/admin-orders.controller.ts`, `backend/src/invoices/invoices.controller.ts`, `backend/src/suppliers/suppliers.controller.ts`, and `backend/src/imports/imports.controller.ts`
- Modify: `backend/test/sales-flows.e2e.mjs`

**Interfaces:**
- Consumes: Task 1's database constraint and default.
- Produces: `EmployeeRole = 'admin' | 'manager'`; every operational controller requires `manager`; the roles guard continues to allow admin as superuser; employee account routes allow only admin.

- [x] **Step 1: Update backend role access tests first.** Change employee fixtures and the route matrix to use only `admin` and `manager`. Assert both roles can access categories, products/variants, promotions/vouchers, orders/packing/COD/invoices, suppliers, and imports; only admin can list/create/update employees; inactive employees still receive `401`; customer and public storefront behavior is unchanged; attempts to create/update an employee using legacy role values receive `400`.
- [x] **Step 2: Run the focused sales flow suite and observe expected failures.** From `backend`, set `TEST_DATABASE_URL` to the isolated `_test` URL, then run `npm run test:prepare`, `npm run build`, and `node --test --test-concurrency=1 test/sales-flows.e2e.mjs`. The new manager fixture should fail because the current DTO still rejects `manager`, or the route matrix should show `403` while controllers still declare specialist roles.
- [x] **Step 3: Replace role definitions and controller metadata.** Limit `EMPLOYEE_ROLES` / `EmployeeRole` to `admin` and `manager`, set the entity role default to `manager`, and replace specialist controller metadata with `@EmployeeRoles('manager')`; the existing `EmployeeRolesGuard` admin override and employee account routes remain unchanged.
- [x] **Step 4: Verify authentication profiles and authorization boundaries.** The existing login/profile and request guards already derive the role from the current employee row and type it via `EmployeeRole`; keep that behavior and verify it against the new two-role fixtures without changing the JWT policy.
- [x] **Step 5: Format the Task 1 migration without changing its behavior, then run backend tests and lint.** From `backend`, apply the configured formatter to the migration, then run `npm test` and `npm run lint` with `TEST_DATABASE_URL` pointed only at a disposable `_test` database.
- [x] **Step 6: Commit this task.** Stage only the listed backend files and commit as `feat: enforce admin manager authorization`.

### Task 3: Merge staff and admin into one management portal

**Files:**
- Modify: `frontend/src/types/index.ts`, `frontend/src/portals/employee-access.ts`, `frontend/src/portals/portal-url.ts`, `frontend/src/apps/AdminApp.tsx`, `frontend/src/pages/admin/AdminPortal.tsx`, `frontend/src/pages/admin/AdminEmployeesPage.tsx`, `frontend/src/components/admin/AdminLayout.tsx`, `frontend/src/components/auth/EmployeeRoute.tsx`, `frontend/src/pages/auth/EmployeeLoginPage.tsx`, `frontend/src/components/layout/Navbar.tsx`, `frontend/src/pages/auth/CustomerLoginPage.tsx`, and `frontend/src/vite-env.d.ts`
- Modify: `frontend/package.json`, `frontend/vite.shared.ts`, `frontend/test/employee-access.test.ts`, `frontend/test/portal-entrypoints.test.tsx`, `frontend/test/vite-portals.test.ts`, `frontend/test/portal-smoke.test.mjs`, and `frontend/test/auth-cart-lifecycle.test.tsx`
- Delete: `frontend/vite.staff.config.ts`, `frontend/src/main.staff.tsx`, `frontend/src/apps/StaffApp.tsx`, `frontend/src/components/auth/StaffRoute.tsx`, and the `frontend/portals/staff/` entry files

**Interfaces:**
- Consumes: Task 2's employee profile role union.
- Produces: port `5175` accepts either employee role; manager sees all operations; admin also sees employee management; port `5174`, `dev:staff`, and `build:staff` are removed.

- [x] **Step 1: Write failing frontend access and portal tests.** Assert the two-role module matrix and employee-management form only offers `admin`/`manager`; admin and manager can log in on `AdminApp`; manager menu contains all operations and not employees; admin sees employees; managers receive an access-denied result on direct `/admin/employees`; employee auth fixtures use only the new role union; no app/bootstrap/config references a staff portal; Vite config and smoke tests exercise only ports `5173` and `5175`.
- [x] **Step 2: Run focused Vitest tests and confirm failures.** Run the frontend test suite filtered to `employee-access`, `portal-entrypoints`, and `vite-portals`.
- [x] **Step 3: Consolidate employee login and routes.** Use only `/admin` as the management path; both roles authenticate at `/employee/login`; route post-login navigation to an allowed module; redirect legacy `/staff/*` paths on the admin origin to the matching `/admin/*` path.
- [x] **Step 4: Remove the staff build/server target.** Delete the staff entry/config files, remove scripts and `VITE_STAFF_PORTAL_URL`, keep user `5173` and admin `5175`, and update API proxy path arrays only if needed for existing paths.
- [x] **Step 5: Run frontend unit tests, smoke tests, and builds.** Run `npm test -- --run`, `npm run test:smoke`, and `npm run build`; expected build outputs are only `dist/user` and `dist/admin`.
- [x] **Step 6: Commit this task.** `4ac0d59227c5d670ac925cd0bf1f1e1212a8743c` (`feat(frontend): unify employee management portal`); Task 4 corrected the README, closing the sole review finding.

### Task 4: Synchronize current role and portal documentation

**Files:**
- Modify: `docs/functional-requirements.md`, `backend/README.md`, `frontend/README.md`, `docs/superpowers/specs/2026-10-06-admin-manager-roles-design.md`, `docs/superpowers/specs/2026-10-01-employee-role-authorization-design.md`, `docs/superpowers/specs/2026-09-28-admin-order-processing-design.md`, `docs/superpowers/specs/2026-09-28-customer-storefront-design.md`, `docs/superpowers/specs/2026-09-29-promotions-vouchers-design.md`, `docs/superpowers/specs/2026-09-29-cod-payment-design.md`, `docs/superpowers/specs/2026-09-27-supplier-import-inventory-design.md`, `docs/superpowers/specs/2026-09-30-payos-payment-design.md`, and `docs/superpowers/specs/2026-10-01-internal-invoices-design.md`

**Interfaces:**
- Consumes: Tasks 1-3's final API role mapping and portal topology.
- Produces: current operator instructions that mention only `admin`, `manager`, customer, ports `3000`, `5173`, and `5175`.

- [x] **Step 1: Find remaining current references.** Search maintained requirements, setup guides, and design specifications for `catalog_manager`, `promotion_manager`, `order_staff`, `purchasing_staff`, `unassigned`, `staff` portal, and port `5174`; distinguish historical plan steps from current user-facing documentation.
- [x] **Step 2: Update current documentation.** Document the two roles, admin-only employee management, manager operational access, the forward migration behavior for unassigned accounts, one employee login/portal, and the remaining ports. Update the current role model design; prominently mark the prior employee authorization design as superseded while preserving its historical record. Update the listed domain specs' access references without rewriting historical implementation plans.
- [x] **Step 3: Verify documentation and patch scope.** `git diff --check` passed; current setup and requirements have no obsolete staff portal instructions or specialist role matrix.
- [x] **Step 4: Commit documentation.** `59507f1dd27188ced433faf09a52b7335a1c351e` (`docs: document admin manager portal model`); independent review approved with no findings.

## Execution Notes

- Follow test-driven development for all behavior changes: write the test, observe the expected failure, then implement.
- Run backend E2E tests only against a `TEST_DATABASE_URL` ending in `_test`; do not use the development database for test reset/migration tests.
- Preserve unrelated untracked files and existing `.env` secrets; do not stage them.
- Revenue statistics are implemented only in its separate plan after this role/portal plan is complete.
