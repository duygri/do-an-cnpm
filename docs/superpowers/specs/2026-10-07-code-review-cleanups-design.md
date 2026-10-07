# Code Review Cleanup Design (Findings 2, 4–12)

**Date:** 2026-10-07  
**Status:** Approved by user (2026-10-07)

## Goal

Address the approved code-review findings 2 and 4–12 across backend configuration and the two frontend portals. Preserve existing API contracts, shopping-cart behavior, portal routes, and visual typography. Treat this as code-quality work, not a change to business workflows.

## Backend CORS

- Add explicit CORS configuration in `backend/src/main.ts`.
- Parse `AUTH_ALLOWED_ORIGINS` as a comma-separated origin allowlist and enable credentialed requests only for those origins.
- Reuse the same configured allowlist for refresh/logout origin validation so CORS and cookie-session checks cannot drift. Accept `Sec-Fetch-Site` values `same-origin` and `same-site` only when the request `Origin` is allowlisted; reject cross-site requests.
- In local development, keep the existing localhost origins for user/admin Vite ports as defaults. In production, fail startup if the allowlist is absent or empty; do not use wildcard origins with credentials.
- Preserve the current same-origin Vite-proxy behavior. Same-site, cross-origin deployment (for example, separate frontend/API subdomains) is supported through credentialed CORS and host-only cookies; cross-site deployment remains out of scope.

## Cart provider decomposition

Keep the public `useCart()` value and current storage format/behavior unchanged. Split internal responsibilities into:

- `useCartPersistence.ts`: owner-specific keys, stored-cart parsing/validation, reads and durable writes.
- `useGuestHandoff.ts`: guest-to-customer migration, reconciliation, and handoff receipt consumption.
- `useCartSync.ts`: owner transitions and cross-tab `storage` synchronization.
- `CartContext.tsx`: compose the hooks, own cart state and expose the existing public context methods.

Keep add/update/remove, order-quantity reconciliation, guest handoff, unavailable-storage behavior, and cross-tab synchronization semantics intact. Stabilize helper callbacks or move effects into the owning hooks so every effect declares its actual dependencies; do not suppress hook dependency warnings with comments.

## Storefront API and navigation cleanup

- Make customer profile fields canonical: `name`, `phone`, and the rest of the backend contract. Remove `fullName` and `phoneNumber` aliases from `CustomerProfile`, remove `normalizeCustomerProfile`, and update consumers to use canonical fields.
- Add a small `useDebouncedValue` hook for the 300 ms search delay. Keep input/query state shared at `AppLayout`, since `Navbar` produces the input and the home route consumes the debounced query.
- Reduce repeated Inter font-family declarations to one shared `sans` font configuration. Replace redundant semantic `font-*` family utilities with `font-sans` while retaining `text-*` typography sizes and weights.
- Make the complete product card one link to its product page, with no nested or duplicate links.
- Extract the storefront wildcard route into a `NotFoundPage` component; keep its content and route behavior.

## Admin and scrollbar cleanup

- Use each operational menu item's `to` path as its React key.
- Replace scrollbar hex literals with semantic CSS color variables sourced from the existing Tailwind palette. Define light and `.dark` thumb values so the scrollbar follows the app's class-based dark-mode mechanism.

## Compatibility and scope

- Do not change backend response shapes, customer cart storage key/version, route paths, search delay, or role behavior.
- Do not replace cart persistence with a new external store or change cart ownership semantics.
- Do not change order, voucher, invoice, PayOS, or inventory behavior.
- No new dependencies are required.

## Verification

- Review the extracted cart hooks against the existing `useCart()` interface and the current guest handoff/storage synchronization behavior.
- Run backend lint/build and frontend typecheck/build; inspect the final diff for scope and formatting issues.
- Do not claim runtime behavior for browser-specific cross-tab cases without dedicated browser verification.
