# Employee Role Authorization Design

## Goal

Replace the current all-active-employees-can-administer policy with explicit
server-enforced employee roles. Keep public storefront, customer authentication,
customer-owned order access, and PayOS signature-verified webhooks separate from
employee authorization. Add a small admin-only API so an administrator can
provision employees and assign or revoke their roles without editing the
database manually.

## Current behavior

- `EmployeeJwtGuard` verifies an employee JWT and loads the employee only when
  `status = active`.
- The employee's `position` is loaded into the request but is not used for
  authorization. It is a free-form string and currently serves as a job title.
- All employee-protected catalog, promotion, order, supplier, import, and
  invoice routes accept any active employee token.
- Customer routes use `CustomerJwtGuard`; storefront reads are public; the
  PayOS webhook verifies its provider signature.
- Business logic is already split into NestJS modules by domain. This design
  adds explicit access boundaries to those modules and a dedicated employee
  administration module; it does not rename existing business URLs or change
  the frontend.

## Actors and role model

Keep `position` as descriptive job-title text and add a separate, validated
`role` field. The role is loaded from PostgreSQL on each authenticated request,
not trusted from JWT claims, so role changes and deactivation take effect
without waiting for token expiry.

| Employee role | Allowed modules and operations |
| --- | --- |
| `admin` | All employee APIs, including employee provisioning and role assignment. |
| `catalog_manager` | Categories, products, and product variants. |
| `promotion_manager` | Promotions and vouchers. |
| `order_staff` | Admin order list/detail, packing, COD confirmation, and admin invoice lookup. |
| `purchasing_staff` | Supplier and import-document management. |
| `unassigned` | Employee profile only; no business-administration APIs until an admin assigns a role. |

The `admin` role is implicitly allowed anywhere an employee role is required.
Customers retain access only to their own customer endpoints and invoices.
Storefront routes stay public and read-only. PayOS webhooks stay outside JWT
guards and continue to rely on signature validation.

## Guard and controller design

- `EmployeeJwtGuard` continues to authenticate the bearer token, require an
  active employee, and attach `employeeId`, `name`, `email`, `position`, and
  `role` to the authenticated request.
- Add an employee-role decorator and `EmployeeRolesGuard`. Every employee
  business route must declare at least one allowed role. The guard grants
  access when the employee has one of those roles or `admin`; missing role
  metadata fails closed.
- The employee profile route is available to every active employee, including
  `unassigned`.
- A valid active employee without the required role receives `403 Forbidden`.
  Missing, invalid, expired, wrong-actor, or inactive credentials continue to
  receive `401 Unauthorized`.
- Every employee management endpoint requires both employee authentication and
  the `admin` role.

## Employee administration API

Add a dedicated `/admin/employees` controller/module:

- `GET /admin/employees?page=1&limit=20` lists employee ID, name, email, phone,
  position, role, and status with bounded pagination. Never return
  `passwordHash`.
- `POST /admin/employees` creates an employee with name, unique normalized
  email, password, optional phone, descriptive position, and an explicit role.
  Hash the password using the existing password service. Apply the existing
  12–128 character password rule.
- `PATCH /admin/employees/:employeeId` updates role and active/inactive status.
  It does not delete employee history or accept a password hash.
- Prevent an administrator from deactivating or demoting their own account and
  prevent deactivating or demoting the last active administrator. Perform the
  last-admin check and update atomically so concurrent admin updates cannot
  remove the final active administrator.
- Keep the existing `db:create-admin` bootstrap command and make it explicitly
  create role `admin`.

No endpoint for employee password reset, audit log, fine-grained permissions,
or hard deletion is included in this MVP.

## Database migration and compatibility

- Add `employee.role` as a non-null string with a database check constraint for
  the supported roles. Default database-created employees to `unassigned` so a
  missing role cannot silently grant administration access.
- Backfill existing employees with `LOWER(TRIM(position)) = 'admin'` to role
  `admin`; backfill all other existing values to `unassigned`. This preserves
  the current bootstrap administrator while requiring explicit assignment for
  other accounts.
- Update employee login/profile response projections to include the role for
  clients. Do not use a role claim in the access token as an authorization
  source.
- Keep migrations reversible and avoid changing order, voucher, invoice,
  payment, or storefront schemas beyond the employee role column.

## Error handling and security

- Duplicate normalized employee email returns `409 Conflict`.
- Invalid role, status, or employee identifier returns `400 Bad Request` or
  `404 Not Found` according to the existing API conventions.
- An employee cannot grant a role to themselves through a client-supplied
  identity; the target ID comes only from the route and the actor ID comes only
  from the authenticated request.
- SQL/database check constraints protect role values even if an API validation
  path is bypassed.
- Employee list responses are explicit projections and must not serialize the
  TypeORM entity or password hash.

## Verification criteria

1. Each role can access its assigned modules and receives `403` for other
   employee modules.
2. `admin` can access all employee modules and manage employee roles/status.
3. `unassigned` can read only its own employee profile and is denied all
   administration endpoints.
4. Customer JWTs cannot access employee routes; employee JWTs cannot access
   customer-owned routes; public storefront and signed PayOS webhook behavior
   remain unchanged.
5. Deactivated employees immediately receive `401`; role changes immediately
   affect the next request without issuing a new JWT.
6. Employee creation hashes passwords, normalizes email, validates role, and
   never returns password hashes.
7. Admin safeguards prevent the current or last active administrator from
   being demoted/deactivated, including concurrent attempts.
8. Existing `position = admin` rows migrate to `admin`; other existing rows
   migrate to `unassigned`.
9. The full automated backend suite passes against the dedicated `_test`
   database.

## Documentation changes

Update `docs/functional-requirements.md` authorization requirements and matrix,
the relevant auth/admin design docs, and `backend/README.md` to remove the
current statement that every active employee has all administrative rights.
