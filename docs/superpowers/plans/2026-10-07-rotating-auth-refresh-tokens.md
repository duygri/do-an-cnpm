# Rotating Refresh Token Implementation Plan

**Spec:** [2026-10-07-rotating-auth-refresh-tokens-design.md](../specs/2026-10-07-rotating-auth-refresh-tokens-design.md)
**Status:** Approved and implemented
**Execution:** Single implementer, in the isolated worktree

## Goal

Implement the approved refresh-token design for customer and employee sessions without changing access-token lifetime, authorization rules, storefront behavior, or employee portal behavior.

## Work plan

### 1. Add refresh-token persistence

- Add a TypeORM entity for one refresh-token generation per row: UUID, family UUID, token digest, customer/employee owner, created/expiry/consumed/revoked timestamps, and replacement reference.
- Add database constraints for exactly one actor owner, unique token digest, actor foreign keys, and lookup indexes for token digest and family.
- Add a migration with no customer/employee data backfill. Preserve old access-token behavior through its existing 15-minute expiry.
- Add scheduled cleanup that removes a family only after it has no unexpired, non-revoked token and its historical rows are at least 30 days old.

### 2. Implement backend token lifecycle

- Add an auth-session service to create independent token families, generate opaque 256-bit refresh values, hash them with SHA-256, and issue the existing 900-second access JWT.
- Implement refresh in a database transaction with a row lock. Consume the presented token, insert its replacement, and move expiry forward by seven days atomically.
- Revoke a whole family when a previously consumed token is presented again. Reject unknown, expired, revoked, or wrong-actor tokens.
- Check that the actor still exists during refresh; reject inactive employees.
- Add owner-specific cookie helpers with the approved name, path, HttpOnly, SameSite, production Secure, and seven-day Max-Age options. Never include raw refresh values in JSON or logs.
- Add refresh and logout endpoints to the existing customer and employee auth controllers. Set cookies on successful login and customer registration; preserve their current JSON response shape. Logout revokes the current family and clears the matching cookie idempotently.
- Enforce same-origin use for cookie-authenticated refresh/logout endpoints without enabling credentialed cross-origin access.

### 3. Integrate browser refresh and logout

- Extend the shared HTTP client to send same-origin credentials and attempt one actor-specific refresh after an authenticated request returns 401.
- Use a same-tab shared refresh promise and a cross-tab Web Lock. After acquiring the lock, re-read the local access token to avoid rotating a cookie that another tab already refreshed.
- On refresh success, replace only the matching actor's access token and retry the original request once. Do not recursively refresh refresh/logout calls.
- Clear local actor credentials and emit the existing unauthorized event only when refresh is rejected. Preserve the local session on refresh network errors.
- Route customer, employee, and React Admin logout through the matching backend logout call, then clear local state even if the request cannot reach the server.
- Keep login/register callers and stored profile contracts compatible; startup profile validation should benefit from the shared one-time refresh path.

### 4. Verify compatibility

- Build the backend and both frontend portals.
- Review the migration and cookie paths against the current Vite proxy and existing auth routes.
- Check the final diff to confirm it is limited to auth-session persistence, auth endpoints, shared frontend auth handling, and the spec/plan documents.
- Do not change or run PayOS, order, voucher, invoice, RBAC, or storefront business behavior.

## Completion criteria

- Customer and employee sessions continue after the 15-minute access JWT expires, provided the refresh session was active within seven days.
- Refresh rotates the token and expiry; old-token reuse revokes that family.
- Customer and employee cookies/routes are isolated by actor and path.
- Logout clears and revokes the current browser session while other device sessions remain valid.
- Backend and both frontend builds succeed, and the existing auth/API contract remains compatible.
