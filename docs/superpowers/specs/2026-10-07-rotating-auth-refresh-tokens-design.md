# Rotating Refresh Tokens for Customer and Employee Sessions

**Status:** Approved (2026-10-07)
**Date:** 2026-10-07

## Goal

Keep access JWTs short-lived at 15 minutes while preventing routine logouts by adding a rotating refresh-token session for both customers and employees. A refresh token is valid for seven days after it is issued or rotated. The seven-day period is a sliding inactivity window: successful refresh issues a new token that expires seven days later. A user who remains active can keep the session; a user inactive for seven days must sign in again.

## Current behavior

- Customer and employee login return a 15-minute bearer access token in JSON.
- The browser stores that token and profile in local storage.
- Protected API requests that receive 401 clear the local session and notify the auth context.
- There is no server-side refresh session or logout revocation endpoint.

## Session and token rules

- Keep the access JWT lifetime at 900 seconds. Keep the existing login/register response fields (access_token, token_type, expires_in, and actor profile) for compatibility.
- On each successful customer or employee login, and customer registration, create a new independent refresh-token family for that browser login.
- Generate an opaque refresh token using cryptographically secure random bytes (at least 256 bits). Send it only as a cookie; never return it in JSON or place it in local storage.
- Persist only a SHA-256 digest of the refresh token. Never persist or log the raw token.
- Refresh rotates the token on every successful use. The old token becomes unusable and a newly generated token receives a seven-day expiry from rotation time.
- Multiple login sessions/devices are allowed. Logout revokes only the current browser's token family.
- Reuse of a previously rotated token is treated as token theft: revoke every token in that family and require a new login. Expired, unknown, revoked, or actor-mismatched tokens return 401 and clear the corresponding cookie.
- Each refresh verifies that the actor still exists. For employees, it must also verify status is active; the existing employee access guard remains responsible for checking active status on protected requests.

## Cookie contract

Use separate, host-only cookies so customer and employee sessions cannot overwrite each other:

| Actor | Cookie name | Path |
| --- | --- | --- |
| Customer | customer_refresh_token | /auth/customer |
| Employee | employee_refresh_token | /auth/employee |

Both cookies use HttpOnly, SameSite=Lax, and a seven-day Max-Age. Set Secure in production and omit the Domain attribute. Use the matching path when clearing a cookie. The frontend and API are same-origin/same-site in the current Vite-proxy setup; cross-site production hosting is out of scope for this change.

## Backend API contract

Add these endpoints without changing existing route prefixes:

- POST /auth/customer/refresh
- POST /auth/employee/refresh
- POST /auth/customer/logout
- POST /auth/employee/logout

Login and customer registration set the actor's refresh cookie while keeping their existing JSON response. A refresh endpoint reads only its actor-specific cookie, atomically consumes it, rotates it, sets the replacement cookie, and returns a fresh access-token response (access_token, token_type, expires_in). A logout endpoint revokes the current token family when the cookie is valid, clears the cookie, and succeeds idempotently if the cookie is absent or already invalid.

Cookie-authenticated refresh/logout endpoints accept same-origin browser requests only. They do not accept a refresh token in the request body, query string, or Authorization header. Existing bearer access-token guards and authorization rules remain unchanged.

## Persistence and rotation transaction

Add a TypeORM entity and migration for refresh-token records. Each row represents one refresh-token generation and contains:

- token record UUID and token-family UUID;
- exactly one actor foreign key (customer_id or employee_id), enforced by a database check constraint;
- unique token digest;
- creation and expiry timestamps;
- consumed/revoked timestamp and optional reference to the replacement token row.

Indexes support digest lookup and family revocation. The row for the presented digest is locked inside a database transaction before it is marked consumed and the replacement row is inserted. The family-revocation path must be transactional as well. The migration does not change customer/employee tables and does not backfill sessions: users with only an old access token can continue using it until its normal 15-minute expiry, then sign in again once to establish a refresh session.

Historical rows can be removed 30 days after a token family has no unexpired, non-revoked token. This preserves replay detection for old token generations in any still-active family.

## Frontend behavior

- Keep access tokens in the existing actor-specific local-storage keys; refresh cookies remain inaccessible to JavaScript.
- In the shared HTTP client, when a request with an actor token receives 401, attempt that actor's refresh endpoint once. If refresh succeeds, replace the stored access token and retry the original request once. Do not recursively refresh the refresh request or retry more than once.
- If refresh fails, the session is invalid: clear the matching access token/profile and emit the existing unauthorized event. A network error during refresh should preserve the session and surface the original request failure rather than silently logging out.
- Use same-origin credentials for requests so browsers send and accept the HttpOnly cookie.
- Coordinate refreshes within a tab using a shared promise and across same-origin tabs using the Web Locks API. After taking the cross-tab lock, re-read the stored access token; if another tab already refreshed it, use the newer token instead of rotating again.
- On app startup, validate the stored access token through the existing profile endpoint; the shared HTTP client's one-time refresh path handles an expired access token while the refresh cookie remains valid.
- Customer and employee logout call the matching logout endpoint, then clear local session state even if the network request fails. Logout revokes the server-side family when the request reaches the backend.

## Out of scope

- Changing the 15-minute access-token lifetime.
- Moving access tokens into cookies or changing authorization headers.
- Account-wide log out all devices UI/API.
- Password-reset flows, MFA, or session-management UI.
- Changing role/permission behavior or any order, voucher, invoice, or PayOS flow.
- Supporting a frontend and API hosted on different sites.

## Acceptance criteria

1. Customer login/register and employee login keep their existing JSON contract, set the correct HttpOnly refresh cookie, and return access tokens with expires_in: 900.
2. A valid refresh rotates the cookie, invalidates the presented token, and returns a new 15-minute access token; each rotation moves the inactivity expiry forward by seven days.
3. An expired, revoked, unknown, or replayed token cannot create an access token; replay revokes the whole family.
4. Customer tokens cannot refresh employee sessions and vice versa. Deactivated employees cannot refresh.
5. Logout revokes only the current token family, clears the correct cookie, and can be repeated safely.
6. The shared frontend client transparently refreshes once and retries the original request once; a failed refresh clears only the matching actor's local session.
7. Concurrent same-origin tab refreshes coordinate so only one rotation is performed for the stored access-token generation.
8. Existing bearer guards, customer storefront behavior, employee React Admin behavior, and current role-based access remain compatible.
