# Code Review Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement tasks sequentially, with an independent review after each task. Steps use checkbox syntax for tracking.

**Status:** Implemented; reviewed and regression-tested

**Goal:** Resolve code-review findings 2 and 4–12 while preserving existing API contracts, cart behavior, routes, and product workflows.

**Architecture:** Add a single configured origin allowlist shared by CORS and same-site auth checks. Decompose cart internals into persistence, guest-handoff, and sync hooks while retaining the current `useCart()` contract. Apply the remaining storefront, admin, typography, and scrollbar cleanups as isolated changes.

**Tech Stack:** NestJS 11, TypeScript, React 18, Vite 6, React Router 6, Tailwind CSS 3.4.

**Spec:** [2026-10-07-code-review-cleanups-design.md](../specs/2026-10-07-code-review-cleanups-design.md)

## Global Constraints

- Preserve the current `useCart()` public value, `indigo_cart_v2` storage format, guest handoff, and cross-tab behavior.
- Allow credentialed CORS only for configured origins; allow `same-origin` and allowlisted `same-site` auth requests, and reject cross-site requests.
- Keep profile fields canonical as `name` and `phone`; preserve API response shapes.
- Keep the search debounce at 300 ms and preserve all existing routes and business workflows.
- Add no dependencies and change no order, voucher, invoice, PayOS, inventory, or role behavior.
- Keep the already-present refresh-token changes intact; do not stage or commit them as part of this cleanup plan.

## Review Focus

1. An unlisted origin or a cross-site browser request must not receive credentialed CORS access or use refresh/logout. **Owner:** Task 1; inspect allowlist parsing, CORS options, and `Sec-Fetch-Site` validation.
2. A customer login must retain guest items, and a failed localStorage write must not falsely mark the handoff complete. **Owner:** Task 2; compare the extracted flow with the current state transitions and persistence receipts.
3. A storage event in another tab must still reconcile guest changes and reload the active owner's cart. **Owner:** Task 2; inspect listener filtering and reconciliation inputs.
4. Removing profile aliases must leave navigation rendering correct from canonical API profile data and stored profile data. **Owner:** Task 3; inspect every profile consumer and initial restore path.
5. A product card must expose one keyboard stop to its detail route while preserving its information and focus indication. **Owner:** Task 4; inspect rendered link structure and focus styling.

---

### Task 1: Configure allowlisted CORS and same-site auth requests

**Files:**
- Modify: `backend/src/main.ts`
- Modify: `backend/src/auth/auth-cookie.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Modify: `backend/src/customers/customers.controller.ts`
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

**Interfaces:**
- Produce `getAllowedAuthOrigins(config: ConfigService): string[]`. It parses comma-separated `AUTH_ALLOWED_ORIGINS`, uses the existing localhost user/admin origins in non-production when unset, and throws during production bootstrap when the value is absent or empty.
- Produce `assertAllowedSameSiteRequest(request: Request, config: ConfigService): void`. It requires an exact allowlisted `Origin`; if `Sec-Fetch-Site` is present, accept only `same-origin` or `same-site`.
- `main.ts` calls the shared origin resolver and enables CORS with `credentials: true`, that exact origin list, and the API's required methods/headers. Never configure `origin: '*'` with credentials.

- [x] **Step 1: Add the shared origin resolver and request assertion.** Replace the duplicated inline default parsing in `auth-cookie.ts` with the named interfaces above; preserve explicit rejection of missing or unlisted `Origin` values.
- [x] **Step 2: Wire CORS during Nest bootstrap.** Read `ConfigService` from the created app, resolve the allowlist before listening, and pass it to `enableCors`; permit the existing JSON, Authorization, and idempotency headers.
- [x] **Step 3: Update refresh/logout controllers.** Use `assertAllowedSameSiteRequest` for both employee and customer refresh/logout actions; leave login and bearer-protected routes unchanged.
- [x] **Step 4: Align environment and setup docs.** Keep the current localhost origins in `.env.example`; document that production must set exact FE origins, that same-site cross-origin requires credentials, and that cross-site hosting is unsupported.
- [x] **Step 5: Verify backend changes.** Run `npm run lint` and `npm run build` from `backend`; inspect the CORS allowlist and cookie-origin paths together.

### Task 2: Split cart persistence, guest handoff, and tab synchronization

**Files:**
- Create: `frontend/src/context/cart/cart-types.ts`
- Create: `frontend/src/context/cart/useCartPersistence.ts`
- Create: `frontend/src/context/cart/useGuestHandoff.ts`
- Create: `frontend/src/context/cart/useCartSync.ts`
- Modify: `frontend/src/context/CartContext.tsx`

**Interfaces:**
- `cart-types.ts` exports `OwnedCart`, `StoredCart`, `GuestHandoff`, and the `CartPersistence` interface used by the hooks.
- `CartPersistence` exposes `readCart(owner: string): CartItem[]`, `readStoredCart(owner: string): StoredCart | null`, `readPersistedGuestHandoff(): GuestHandoff | null`, `writeCart(cart: OwnedCart, handoff: GuestHandoff | null): boolean`, and `removeCart(owner: string): boolean`. A write/removal returns `false` on storage failure or read-back mismatch.
- `useCartPersistence(): CartPersistence` owns cart-key construction, validation/parsing, reads, writes, and removal.
- `useGuestHandoff(persistence: CartPersistence): GuestHandoffController` returns `handoffRef: MutableRefObject<GuestHandoff | null>`, `readOwnerCart(owner: string): CartItem[]`, `reconcileGuestItems(items: CartItem[]): CartItem[]`, `prepareCustomerCart(owner: string, guestItems: CartItem[]): CartItem[]`, and `persistCart(cart: OwnedCart): boolean`; it preserves snapshot receipts internally. Export `GuestHandoffController` from `useGuestHandoff.ts`.
- `useCartSync(options: CartSyncOptions): void` owns owner-change and `storage` listener effects. Export `CartSyncOptions` from `useCartSync.ts`; it contains `owner: string`, `cart: OwnedCart`, `cartRef: MutableRefObject<OwnedCart>`, `setCart: Dispatch<SetStateAction<OwnedCart>>`, and `handoff: GuestHandoffController`. Its callbacks are stable, and every effect lists all callback and state dependencies.
- `CartContext.tsx` remains the owner of `CartContextType`, the public methods, and cart state; `useCart()` keeps the same shape.

- [x] **Step 1: Define shared cart types.** Move the existing `OwnedCart`, `StoredCart`, and `GuestHandoff` shapes into `cart-types.ts` without changing fields or storage serialization.
- [x] **Step 2: Extract storage helpers.** Move cart key generation, item validation, stored-cart parsing, owner reads, guest handoff receipt reads, and durable writes into `useCartPersistence.ts`; preserve all current unavailable-storage fallbacks.
- [x] **Step 3: Extract guest migration.** Move snapshot tracking, guest reconciliation, merge, receipt consumption, and handoff completion into `useGuestHandoff.ts`; make the returned operations stable with `useCallback` or refs.
- [x] **Step 4: Extract synchronization effects.** Move owner transition and cross-tab storage event behavior into `useCartSync.ts`; declare every non-stable dependency and stabilize callbacks at their source.
- [x] **Step 5: Compose the provider.** Update `CartContext.tsx` to compose the hooks and keep the exact existing context methods and behavior.
- [x] **Step 6: Review cart behavior.** Trace login migration, logout/owner change, order quantity removal, guest storage events, malformed storage, and storage write failures against the Review Focus and existing logic.
- [x] **Step 7: Verify frontend compilation.** Run `npm run build` from `frontend` and inspect the provider/hook diff for accidental storage-key or serialized-format changes.

### Task 3: Canonicalize customer fields and isolate search debounce

**Files:**
- Create: `frontend/src/hooks/useDebouncedValue.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/components/layout/Navbar.tsx`
- Modify: `frontend/src/apps/UserApp.tsx`

**Interfaces:**
- `useDebouncedValue<T>(value: T, delayMs: number): T` returns the latest value after the requested delay and clears its pending timer when value or delay changes or the component unmounts.
- `CustomerProfile` exposes canonical backend fields; remove deprecated `fullName` and `phoneNumber` properties.

- [x] **Step 1: Remove profile aliases.** Remove `normalizeCustomerProfile` and its call sites; remove only the customer aliases from `CustomerProfile`; update Navbar to use `name` and `email` fallbacks.
- [x] **Step 2: Add debounce hook.** Implement `useDebouncedValue` with a window timeout and cleanup; keep the 300 ms delay.
- [x] **Step 3: Use the hook in AppLayout.** Retain `searchInput` at the shared layout and derive `searchQuery` with the hook; keep Navbar and HomePage wiring unchanged.
- [x] **Step 4: Verify frontend compilation.** Run `npm run build` from `frontend`; inspect customer-profile usages for remaining deprecated alias access.

### Task 4: Clean up typography, product navigation, not-found route, keys, and scrollbar tokens

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: every `frontend/src/**/*.{tsx,jsx}` file using the redundant `font-headline-*`, `font-body-*`, `font-price-*`, or `font-label-*` family utilities
- Modify: `frontend/src/components/storefront/ProductCard.tsx`
- Create: `frontend/src/pages/storefront/NotFoundPage.tsx`
- Modify: `frontend/src/apps/UserApp.tsx`
- Modify: `frontend/src/apps/AdminApp.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Configure the shared Tailwind `fontFamily.sans` stack as `Inter, system-ui, sans-serif`; all size/weight `text-*` utilities remain unchanged.
- `NotFoundPage` is a presentational component used by the storefront wildcard route; it does not add or remove routes.

- [x] **Step 1: Consolidate font family.** Set one `sans` font stack and replace duplicate semantic font-family classes with `font-sans`; preserve all `text-*`, weight, line-height, and responsive utilities.
- [x] **Step 2: Make ProductCard one link.** Wrap card content in one product detail link, remove nested/duplicate anchors, and retain an explicit visible focus style and image alternative text.
- [x] **Step 3: Extract storefront not-found page.** Move the existing wildcard-route markup to `NotFoundPage` and render that component at the same route.
- [x] **Step 4: Fix admin menu key.** Change `operationalLinks.map` to use `item.to` as the key.
- [x] **Step 5: Tokenize scrollbar colors.** Define light and `.dark` CSS variables from the Tailwind palette and use them for thumb and hover backgrounds; remove direct hex values from scrollbar rules.
- [x] **Step 6: Verify portal compilation.** Run `npm run build` from `frontend`; inspect generated classes for missing font families and inspect the card for nested links.

### Task 5: Final scope and build verification

**Files:**
- Review: all files changed by Tasks 1–4

- [x] **Step 1: Verify backend.** Run `npm run lint` and `npm run build` from `backend`.
- [x] **Step 2: Verify both portals.** Run `npm run build` from `frontend` (it type-checks and builds the user and admin portals).
- [x] **Step 3: Verify patch hygiene and scope.** Run `git diff --check`; keep the regression tests in the cleanup commit and the refresh-token changes isolated in the preceding commit.
- [x] **Step 4: Summarize runtime limits.** Record that browser cross-tab cart behavior was not exercised in a browser; its existing Vitest/jsdom lifecycle tests pass.
