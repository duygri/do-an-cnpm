# Admin Revenue Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give shop admins an internal view of paid order totals and daily collections.

**Architecture:** Add a small NestJS reports module with an admin-only aggregate endpoint using payment confirmation time and PostgreSQL decimal aggregation. Add a date-filtered revenue page to the unified management portal without introducing a chart library.

**Tech Stack:** NestJS 11, TypeScript, PostgreSQL, TypeORM, React 18, React Router 6, Vite, Vitest, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-revenue-statistics-design.md`

## Global Constraints

- Count orders whose `payment_status` is `paid` and whose order `status` is not `cancelled`.
- Attribute revenue to `payment_confirmed_at`, converted to `Asia/Ho_Chi_Minh` before grouping by calendar date.
- Sum `sales_order.total_amount`, the customer charged amount after discount and including recorded shipping fee; label it as collected order amount.
- Only `admin` may access the report API and management route.
- Accept valid date ranges no longer than 366 calendar days, and return decimal amounts as strings.
- Return a continuous daily series including zero-activity dates.
- Do not add a chart dependency or change order/payment/invoice/refund behavior.

## Review Focus

1. PayOS and COD paid orders must be attributed to the local calendar day they were confirmed, not their order creation day — cover in Task 1 integration tests.
2. Unpaid or cancelled orders must not affect amount or count — cover in Task 1 integration tests.
3. Empty dates must remain in sequence with zero amounts — cover in Task 1 service/API tests.
4. Invalid dates and date ranges over 366 days must produce `400` — cover in Task 1 validation tests.
5. Manager, customer, and anonymous callers must not receive revenue data; admin must — cover in Task 1 API tests and Task 2 direct-route tests.

---

### Task 1: Add a validated admin revenue API

**Files:**
- Create: `backend/src/reports/reports.module.ts`
- Create: `backend/src/reports/revenue-report.controller.ts`
- Create: `backend/src/reports/revenue-report.service.ts`
- Create: `backend/src/reports/dto/get-revenue-report.dto.ts`
- Modify: `backend/src/app.module.ts` and `backend/test/sales-flows.e2e.mjs`

**Interfaces:**
- Consumes: the admin/manager role union and `EmployeeJwtGuard` / `EmployeeRolesGuard` after the role-model plan.
- Produces: `GET /admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` with `{ from, to, timezone, paidOrderCount, collectedAmount, daily: [{ date, orderCount, amount }] }`.

- [x] **Step 1: Add failing HTTP tests before production code.** Create paid COD/PayOS orders with payment-confirmed timestamps, an unpaid order, and a cancelled order in a temporary date range. Assert paid non-cancelled amounts/counts and Vietnam-local day grouping; assert zero-activity calendar days are returned; assert admin receives `200` while manager, customer, and anonymous callers are denied.
- [x] **Step 2: Add failing query validation tests.** Assert malformed dates, impossible calendar dates, `to < from`, and spans above 366 days return `400`.
- [x] **Step 3: Run the focused sales E2E test and observe expected failures.** Use only the dedicated `_test` database; the new endpoint should be `404` or validation assertions should fail before implementation.
- [x] **Step 4: Implement the request DTO and report query.** Validate strict ISO calendar dates and the inclusive range limit. Inject `Repository<SalesOrder>` through `TypeOrmModule.forFeature([SalesOrder])`; use SQL aggregation over `payment_confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh'`, exclude cancelled/unpaid orders, sum numeric strings in PostgreSQL, and fill dates with zeroes in the service without converting money through JavaScript floats.
- [x] **Step 5: Add the admin-only controller and register the reports module.** Expose only the approved GET route under employee JWT and `@EmployeeRoles('admin')`; return the exact response fields from the spec.
- [x] **Step 6: Run focused and full backend checks.** Report HTTP test, `npm test` (25/25), and `npm run lint` passed against dedicated `sales_system_test`.
- [x] **Step 7: Commit this task.** `1d43d73fca389dbd45d654fa6d42f7ef3f38e3d1` (`feat: add admin revenue report API`).

### Task 2: Add the admin revenue page

**Files:**
- Create: `frontend/src/pages/admin/AdminRevenuePage.tsx`
- Modify: `frontend/src/types/index.ts`, `frontend/src/services/api.ts`, `frontend/src/portals/employee-access.ts`, `frontend/src/pages/admin/AdminPortal.tsx`, `frontend/src/components/admin/AdminLayout.tsx`, `frontend/test/employee-access.test.ts`, and new `frontend/test/admin-revenue.test.tsx`

**Interfaces:**
- Consumes: Task 1's response shape and the unified management portal from the role-model plan.
- Produces: `api.getRevenueReport(from: string, to: string): Promise<RevenueReport>` and an admin-only `revenue` module.

- [x] **Step 1: Write failing tests for role visibility and data rendering.** Assert manager does not see the report module and direct `/admin/revenue` navigation is denied; admin sees the menu/page; selected dates are sent to the API; decimal-string total and daily values render exactly; zero values are visible accessibly.
- [x] **Step 2: Run the focused frontend tests and observe expected failures.** Run `npm test -- --run test/employee-access.test.ts test/admin-revenue.test.tsx`.
- [x] **Step 3: Add typed API integration.** Define `RevenueReport` / daily-entry types using string amount fields and add `api.getRevenueReport(from, to)`.
- [x] **Step 4: Implement the page and admin-only module route.** Default to the current calendar month in `Asia/Ho_Chi_Minh`; add date inputs, summary cards, daily CSS bars, and an exact-value daily list/table. Add no chart package. Wire direct unauthorized navigation through the existing role module guard.
- [x] **Step 5: Run frontend verification.** Initial frontend unit 74/74, smoke 7/7, and build passed; after review fix, frontend 75/75, smoke 7/7, and build passed.
- [x] **Step 6: Commit this task.** `e1654f26f73457847919703d3c63850de8083ac1` (`feat(frontend): add admin revenue statistics`) plus correction `030fb2bebfde7eb1ec32a2f143ca0ce9e081da1a` (`fix(frontend): correct default revenue date range`); both passed independent review.

### Task 3: Document the report definition and finish verification

**Files:**
- Modify: `docs/functional-requirements.md`, `backend/README.md`, and `frontend/README.md`

**Interfaces:**
- Consumes: Tasks 1-2's API, access model, and date behavior.
- Produces: user-facing project documentation that defines what the MVP calls collected order revenue and how to open the page.

- [x] **Step 1: Update current documentation.** Document admin-only access, API query parameters, Vietnam timezone, paid/non-cancelled rules, amount inclusion of shipping, date defaults, and that this is an internal MVP report rather than tax/accounting output.
- [x] **Step 2: Check documentation against the design spec and implementation.** Search for conflicting meanings of revenue or claims about tax/accounting support and correct only current documentation.
- [x] **Step 3: Run final checks.** `git diff --check` passed; backend tests 25/25 and lint pass after a formatting-only service fix; frontend tests 75/75, smoke 7/7, and both builds passed. Unrelated user files were preserved.
- [x] **Step 4: Commit the documentation.** `ecec2e43b8384c92b27c2102829753d4b39d8f97` (`docs: define admin revenue report`).

## Execution Notes

- Follow test-driven development for report behavior and role access.
- Backend E2E tests must use a `TEST_DATABASE_URL` ending in `_test`; never target the development database for destructive test preparation.
- Do not include revenue in tax invoices, import costs, refunds, or inventory accounting; those are not modeled by this MVP.
- Preserve unrelated working-tree files and do not stage `.env` files.
