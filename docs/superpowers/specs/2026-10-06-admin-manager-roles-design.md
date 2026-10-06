# Employee Admin/Manager Roles and Unified Admin Portal Design

## Goal

Simplify employee authorization to two roles and let administrators and managers use one management portal. Customers remain a separate actor stored in `customer` and continue using the storefront.

This change provides the role and portal foundation before a later decision about adopting React-admin. It does not introduce the React-admin framework or change the customer storefront.

## Approved role model

`employee.role` accepts exactly:

- `admin`: access to every employee operations API and employee account administration.
- `manager`: access to operational APIs for catalog, promotions, orders, supplier records, and import documents. Cannot list, create, activate, deactivate, or change employee roles.

The existing `employee.status` (`active` / `inactive`) remains the account lock mechanism. Do not add a duplicate `is_active` field. Customer accounts remain in `customer`; `User` is not an employee role.

## Database migration

Add a forward migration rather than editing a migration that may already have run:

1. Drop the current employee role check constraint.
2. Keep `admin` as `admin`.
3. Map existing `catalog_manager`, `promotion_manager`, `order_staff`, and `purchasing_staff` employees to `manager`.
4. Map `unassigned` employees to `manager`; set any currently active such account to `inactive` so the migration does not silently grant it operational access. Preserve already-inactive accounts as inactive.
5. Change the role default to `manager` and add a check constraint accepting only `admin` and `manager`.
6. Preserve the existing role/status index.

On rollback, map `manager` employees to the prior least-privilege `unassigned` value, restore the old default and check constraint, and retain account status. Collapsed specialist roles cannot be reconstructed after migration; this is an intentional one-way role consolidation. A rollback therefore restores access conservatively rather than guessing old roles.

## Backend authorization

Keep `EmployeeJwtGuard` as the authentication and active-account check. Update the role type, DTO validation, profile responses, and role check constraint to use only `admin` and `manager`.

Catalog, promotion/voucher, order/packing/COD/invoice, supplier, and import controllers require `manager`; the existing role guard continues to let `admin` act as the superuser. Employee account endpoints remain restricted to `admin`. Customer JWT endpoints and signed PayOS webhooks keep their existing policies.

## Unified employee portal

Keep the storefront at port `5173` and the single management application at port `5175`. Both `admin` and `manager` log in through the management app's employee login. The app loads the authenticated role and filters modules:

- `manager`: orders, categories, products, promotions, suppliers, and imports.
- `admin`: all operational modules plus employees.

Route guards must deny direct navigation to a hidden module. The backend remains the security boundary; hiding a menu is not authorization. Remove the separate staff Vite config, entry point, scripts, build output, and documentation for port `5174`. The old staff route may redirect to its matching `/admin/...` route when requested on the unified portal origin.

React-admin is intentionally a later, separate frontend decision. The existing admin UI remains the implementation surface for this role consolidation.

## Compatibility and operations

Employee email/password credentials do not change. Legacy employee role-specific menu assignments collapse into one manager role. Accounts previously left unassigned are inactive after migration and require an admin to activate them. The local development topology becomes backend `3000`, storefront `5173`, and unified management portal `5175`.

## Verification

- Migration tests cover every previous role value, preservation of administrators, conservative deactivation of active unassigned accounts, the new check constraint/default, and rollback behavior.
- Backend access tests prove manager access to each operational domain and `403` access to employee administration; admin can access both; invalid role values are rejected; inactive employees remain unable to authenticate.
- Frontend smoke/build checks cover the user and unified management portals, including direct links, manager/admin bootstraps, and the removal of the staff build target.
- Update the functional requirements and local run instructions to describe only the two employee roles and unified management portal.

## Options considered

1. Keep the specialized employee roles and the staff portal. This preserves the existing split but does not meet the requested two-role model or single Admin Panel.
2. Collapse to `admin`/`manager` and share one management portal. This matches the requested model and avoids separate authentication and navigation flows; selected.
3. Keep legacy role values as aliases temporarily. This would make the role column and account UI continue to expose old roles, requiring ongoing compatibility logic without providing useful separation for this MVP.
