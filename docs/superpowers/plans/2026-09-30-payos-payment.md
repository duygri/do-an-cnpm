# PayOS Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure PayOS hosted checkout and 15-minute unpaid-order expiry to the NestJS backend while preserving COD and leaving the frontend untouched.

**Architecture:** Keep order pricing and voucher reservation in the existing order service. Persist PayOS attempts separately, use an injectable provider adapter for SDK calls, and reconcile callbacks and expiry through database-locked state transitions. Require idempotency keys for PayOS order requests so retries reuse the same order and provider order code.

**Tech Stack:** TypeScript, NestJS 11, TypeORM, PostgreSQL, `@payos/node`, `@nestjs/schedule`.

---

## File map

- `backend/src/orders/entities/sales-order.entity.ts`: allow COD/PayOS and encode valid confirmation metadata.
- `backend/src/payments/entities/payment-attempt.entity.ts`: persist PayOS link, reconciliation, and expiry state.
- `backend/src/database/migrations/<next-timestamp>-add-payos-payments.ts`: add order idempotency metadata and payment-attempt persistence with guarded rollback.
- `backend/src/payments/**`: payment-provider interface, official PayOS adapter, orchestration, webhook controller, scheduled expiry/reconciliation worker, and module.
- `backend/src/orders/dto/create-order.dto.ts`, `orders.controller.ts`, `orders.service.ts`: payment choice, idempotency header, amount rules, checkout responses, and customer cancellation.
- `backend/src/orders/admin-orders.service.ts`: block packing unpaid PayOS orders, keep mark-paid COD-only, and expose reconciliation flags without checkout URLs.
- `backend/src/app.module.ts`, `backend/package.json`, `backend/package-lock.json`: register payment/schedule modules and runtime dependencies.
- `backend/.env.example`, `backend/README.md`, `docs/erd/sales-system-erd.md`: document configuration, endpoint behavior, and payment-attempt relationship.

## Task 1: Persist payment attempts and support PayOS order metadata

**Files:**
- Modify: `backend/src/orders/entities/sales-order.entity.ts`
- Create: `backend/src/payments/entities/payment-attempt.entity.ts`
- Create: `backend/src/database/migrations/<next-timestamp>-add-payos-payments.ts`
- Modify: `backend/src/orders/orders.module.ts`
- Modify: `backend/src/payments/payos-payment.module.ts`

- [ ] **Step 1: Add the payment attempt entity**

Define provider and attempt status unions, columns for `order_id`, unique `provider_order_code`, provider link ID, checkout URL, exact positive whole-VND amount, setup lease, expiry, paid time, unique nullable transaction reference, aggregate observed paid amount, reconciliation reason/time, and timestamps. Add TypeORM checks, a restrictive one-to-one order relation, and indexes for due setup/expiry scans. Keep secrets and full webhook payloads out of the entity.

- [ ] **Step 2: Extend the sales-order entity**

Add `payos` to the payment-method type. Add nullable idempotency key and SHA-256 request-fingerprint columns. Change payment checks so unpaid rows have no confirmation metadata, paid COD rows require employee and timestamp, and paid PayOS rows require timestamp with no employee. Keep `NULL` compatibility if the current database permits historical null methods.

- [ ] **Step 3: Write the additive migration**

Use a timestamp greater than the current latest migration (`1790740000000-create-promotions-vouchers.ts`). Add the idempotency columns and partial unique index on `(customer_id, idempotency_key)`, replace payment constraints, and create `payment_attempt` with indexes and constraints, including a unique constraint on non-null provider transaction references. In `down`, acquire a write-blocking lock before checking for PayOS orders/attempts; abort if online-payment history exists, otherwise remove the additions.

- [ ] **Step 4: Register the entity in the order module**

Add `PaymentAttempt` to `TypeOrmModule.forFeature` and ensure the migration entity shape matches the database exactly.

- [ ] **Step 5: Register repositories for payment services**

Register `SalesOrder` and `PaymentAttempt` in `PaymentsModule`'s `TypeOrmModule.forFeature` because webhook, reconciliation, and expiry services use both repositories. Keep the same entities registered for the order services that need them.

## Task 2: Add PayOS provider infrastructure and runtime configuration

**Files:**
- Create: `backend/src/payments/payment-provider.ts`
- Create: `backend/src/payments/payos-payment.provider.ts`
- Create: `backend/src/payments/payos-payment.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] **Step 1: Add official dependencies**

From `backend`, install `@payos/node` and `@nestjs/schedule` using npm so the lockfile is updated. Do not change the supported Node engine range unless dependency metadata requires it.

- [ ] **Step 2: Define the provider boundary**

Define methods for create-link, get-link, cancel-link, and verify-webhook. Keep PayOS SDK types inside its adapter and return a small application-owned shape containing link ID, checkout URL, status, amount, amountPaid, amountRemaining, currency, orderCode, and transaction reference as applicable.

- [ ] **Step 3: Implement the official SDK adapter**

Initialize `PayOS` from `ConfigService` with client ID, API key, and checksum key. Build a short deterministic description within PayOS's channel-specific 9-character limit. Set `orderCode`, exact integer amount, return/cancel URLs, and `expiredAt`. Implement status lookup by local order code and cancellation; never log credentials, signatures, bank details, or checkout URLs.

- [ ] **Step 4: Make configuration conditional on PayOS use**

Require credentials and return/cancel URLs only when creating positive-total PayOS checkout. Keep COD booting and operating when PayOS variables are absent. Export the payment orchestration/provider from its module and avoid a module cycle with `OrdersModule`.

- [ ] **Step 5: Register scheduled jobs**

Import `ScheduleModule.forRoot()` once in `AppModule` and register the payment module. Do not create multiple scheduler roots.

## Task 3: Add payment-aware idempotent customer order creation

**Files:**
- Modify: `backend/src/orders/dto/create-order.dto.ts`
- Modify: `backend/src/orders/orders.controller.ts`
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/orders/orders.module.ts`
- Modify: `backend/src/payments/payos-payment.module.ts`
- Create: `backend/src/payments/payments.service.ts` (PayOS link initiation and retry reconciliation; Task 4 extends it for webhooks and Task 5 extends it for cancellation/expiry.)

- [ ] **Step 1: Validate payment selection and idempotency input**

Accept optional `paymentMethod` (`cod` or `payos`), defaulting to COD. Read and validate `Idempotency-Key` for PayOS, rejecting missing keys and invalid length/characters. Ignore this header for COD so existing COD persistence and behavior remain unchanged.

- [ ] **Step 2: Canonicalize and resolve retries**

Create a deterministic SHA-256 fingerprint from payment method, trimmed recipient/shipping fields, normalized voucher code, and variant/quantity lines sorted by variant ID. Before creating an order, look up the customer's key. Recheck it inside the transaction and, for voucher orders, after acquiring the voucher/promotion row locks but before redemption-count validation, so a concurrent retry cannot fail as “voucher exhausted” before recognizing its original order. Keep the unique customer/key index as the final race guard. Return/reconcile the same order for a matching fingerprint; return `409` if the key was reused with different request data.

- [ ] **Step 3: Enforce PayOS money rules before persisting**

Use the existing BigInt-cent calculation after voucher discount. Reject a fractional VND total or a positive amount outside the exact safe-integer/provider range before inserting order, details, or voucher use. A zero-total PayOS order is marked paid locally in the creation transaction with no attempt/link and a null employee confirmer.

Before saving a positive-total PayOS order or payment attempt, verify required PayOS credentials and return/cancel URLs are configured. This validation occurs after server-side pricing determines the total, so zero-total PayOS orders remain exempt.

- [ ] **Step 4: Keep database creation atomic**

In the existing order transaction, persist payment method and PayOS idempotency data with the order/details. For a positive PayOS total, insert a `creating` payment attempt whose provider order code is the new order ID and expiry is exactly 15 minutes after creation. Claim/reclaim the setup lease under a row lock and only when the stored lease has elapsed. Bound the PayOS create request timeout/retries so the maximum request duration is shorter than the lease. Preserve the existing voucher row locks and redemption-count semantics.

- [ ] **Step 5: Create or reuse the provider link after commit**

Call the payment orchestration service outside the order transaction. Look up PayOS by the unique order code before a retry; reuse an existing link only when its checkout URL was already saved locally and provider lookup confirms it is pending with zero paid and the full amount remaining. PayOS lookup does not return `checkoutUrl`, so if an existing link is found without a locally persisted URL, mark the attempt `reconciliation_required`, keep the order pending/unpaid and voucher reservation, expose administrator attention, and do not infer a URL, create a second link, or close the order automatically. A matching retry returns `503` while reconciliation is required. A fully paid discovered link uses the normal paid transition; partial/inconsistent payment remains reserved for reconciliation. Recheck that the order remains pending/unpaid and the attempt is `creating` and not expired before any link-create call; never create or recreate a link for a terminal or expired order. After the provider call, open a transaction, lock both rows, and require the order still pending/unpaid, the attempt still `creating`, and `expires_at > now()` before saving the link and setting `pending`. If the attempt became terminal or its deadline passed while the call was in flight, do not persist/expose the checkout URL; cancel or reconcile the provider link under the normal expiry rules. On ambiguous timeout return `503` but keep the order/attempt and voucher reservation; a retry with the same idempotency key must reconcile it. If PayOS confirms no link exists while the order is within its 15-minute deadline, leave the attempt `creating` for scheduled retry with the same order code; if the deadline has passed, atomically mark attempt failed/expired and order cancelled to release the voucher.

- [ ] **Step 6: Return only customer-owned checkout data**

Include checkout URL and expiry in PayOS create response and the customer's own order detail only while the attempt is pending. Do not expose links in customer order lists or employee responses. Return zero-total orders as paid without checkout fields.

## Task 4: Implement PayOS webhook reconciliation

**Files:**
- Create: `backend/src/payments/payos-webhook.controller.ts`
- Create: `backend/src/payments/payments.service.ts`
- Modify: `backend/src/payments/payos-payment.module.ts`
- Modify: `backend/src/payments/entities/payment-attempt.entity.ts`

- [ ] **Step 1: Add the public webhook route**

Expose `POST /payments/payos/webhook` without customer or employee guards. Pass the JSON body to the SDK's signature verification and reject invalid signatures before any database/provider state change.

- [ ] **Step 2: Validate and reconcile successful candidates**

Require top-level success, top-level code `00`, nested data code `00`, currency `VND`, and matching local order code/link/amount. Query PayOS and require overall `PAID`, aggregate amountPaid equal to the order amount, and amountRemaining zero before local settlement. If provider state shows partial or inconsistent money movement, durably mark the known attempt `reconciliation_required`, retain reference/aggregate amount/reason, and surface admin attention without marking the order paid or releasing its voucher. Do not trust return URL query parameters or a single transaction amount.

- [ ] **Step 3: Apply the paid transition atomically**

After provider reconciliation, begin a database transaction and lock the order and attempt. Recheck order and attempt status. For pending/unpaid orders with `creating`, `pending`, or `reconciliation_required` attempts, store the provider reference/aggregate amount, mark the attempt paid, clear any reconciliation reason/time, and set order payment status/confirmation time while leaving employee confirmer null. A repeated event with the same provider reference is idempotent.

- [ ] **Step 4: Preserve exceptional payment events**

If a verified full payment arrives for a locally cancelled order, or an extra successful transaction reference arrives for an already-paid order, mark the attempt `reconciliation_required`, store safe identifiers/observed paid amount/reason, and expose an admin attention flag without silently reopening/cancelling the order. For unknown/mismatched verified events, acknowledge the callback after logging only safe identifiers and the mismatch reason. Never log secrets or bank-account details.

## Task 5: Add cancellation and 15-minute expiry reconciliation

**Files:**
- Modify: `backend/src/orders/orders.service.ts`
- Modify: `backend/src/payments/payments.service.ts`
- Create: `backend/src/payments/payment-expiry.scheduler.ts`
- Modify: `backend/src/payments/payos-payment.module.ts`

- [ ] **Step 1: Make customer PayOS cancellation provider-aware**

Keep COD cancellation behavior unchanged. For PayOS pending/unpaid orders whose attempt is `pending`, request provider cancellation before the local transaction. Do not allow customer cancellation for `reconciliation_required` attempts. Then lock both rows and recheck pending/unpaid plus `pending` attempt state; update order and attempt to cancelled together only when provider confirms the link is no longer payable with zero paid. If paid, return conflict; if status is ambiguous/unavailable, leave local state and voucher use unchanged. Terminal or reconciliation-required attempts must not expose a checkout URL.

- [ ] **Step 2: Reconcile link setup before expiry**

Run an every-minute job for `creating` attempts whose setup lease elapsed and unresolved `reconciliation_required` attempts. Claim each attempt so only one worker/request reconciles it at once; query PayOS by order code and inspect the full aggregate link status before changing local state. PayOS lookup does not return `checkoutUrl`. If an existing link is found before the deadline, reuse a locally saved URL and set/keep the attempt pending only when provider status is `PENDING`, amountPaid is zero, amountRemaining equals the expected order amount, and the order remains pending/unpaid. If a link exists but no URL was saved locally (for example, the initial create response timed out), mark `reconciliation_required`, keep order pending/unpaid and voucher reserved, expose admin attention, return `503` on same-key customer retries, disallow customer cancellation, and never infer a URL, create a replacement link, or automatically close the order. Full aggregate payment transitions an eligible pending/unpaid order and attempt to paid under locks and clears the reconciliation reason; partial/inconsistent funds remain reserved for reconciliation. A provider-cancelled/non-payable orphan link with zero paid remains `reconciliation_required` and does not automatically release the voucher. If a known link with a saved URL is cancelled/non-payable with zero paid, it is recorded as failed and the order is cancelled after the same locked recheck; do not create a second link for that order. If a link is found after the deadline, do not save/expose its URL or set it pending: query aggregate paid state, then lock both rows and recheck local state. For a fully paid provider link, mark both order and attempt paid only if the order is still pending/unpaid; if the order is already paid and the stored provider reference is the same, treat it as an idempotent no-op; if the order is cancelled or an already-paid order has a different reference, set the attempt to `reconciliation_required` without reopening the order. Cancel a known link and expire/cancel the local order only after PayOS confirms it is no longer payable with zero paid and a transaction locks both rows and rechecks pending/unpaid plus attempt `creating`. If the provider confirms no link exists and the order is still pending/unpaid and within its deadline, retry creation with the same order code. If the deadline has passed and PayOS confirms no payable link and zero amount paid for an attempt with no provider link, cancel the order and expire the attempt only after the same locked recheck. If state is ambiguous or any amount was paid, release the claim with a retry delay and keep voucher reservation; flag possible funds for reconciliation. Never create a link for a terminal order or attempt.

- [ ] **Step 3: Expire pending links safely**

For pending attempts past `expires_at` that have a locally saved checkout URL, fetch PayOS state, record full payment if confirmed, otherwise cancel the link. Only after PayOS confirms that known link is cancelled/not-payable and zero paid may one transaction lock/recheck both rows and set order/attempt cancelled/expired. Orphan links with no locally saved checkout URL are handled as `reconciliation_required` in Step 2 and must keep the order/voucher reserved even if PayOS confirms them unpaid/cancelled. A worker/webhook race must never let a stale cancellation release voucher use after the order became paid.

- [ ] **Step 4: Keep unresolved or partially paid orders reserved**

When PayOS reports partial funds, an inconsistent amount, a missing locally saved URL for an existing provider link, or ambiguous/unavailable state, mark the attempt `reconciliation_required`, expose an admin attention flag, and do not cancel the order or free voucher quota automatically. Continue provider-state reconciliation for these attempts; settle a later confirmed full payment under the normal row locks, but leave other unpaid outcomes reserved for administrator review. Retry ordinary transient provider failures without changing local order state.

## Task 6: Enforce admin payment transitions

**Files:**
- Modify: `backend/src/orders/admin-orders.service.ts`
- Modify: `backend/src/orders/admin-orders.controller.ts`

- [ ] **Step 1: Guard packing by payment method**

Keep existing pending/unpaid COD packing. Require PayOS orders to be paid before packing; return `409 Conflict` for unpaid PayOS orders. Preserve the current order-row lock.

- [ ] **Step 2: Keep manual payment confirmation COD-only**

Reject `mark-paid` for PayOS orders even if a caller bypasses the customer workflow. Do not allow employees to overwrite provider status.

- [ ] **Step 3: Expose safe admin payment state**

Add payment method/attempt status and `paymentAttentionRequired` with the transaction reference/observed amount/reason where needed to admin order details. The missing-checkout-URL case must remain visible for administrator review. Never return checkout URL, signature, or secret configuration to employees.

## Task 7: Document PayOS setup and the updated ERD

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/README.md`
- Modify: `docs/erd/sales-system-erd.md`

- [ ] **Step 1: Document environment values**

Add placeholder values for `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_URL`, and `PAYOS_CANCEL_URL`. Do not copy the user's local `.env` or any credentials.

- [ ] **Step 2: Document endpoint contracts and lifecycle**

Explain the PayOS `Idempotency-Key`, optional `paymentMethod`, exact-VND constraint, zero-total local settlement, returned checkout fields, webhook trust boundary, 15-minute expiration/retry behavior, COD compatibility, admin packing rule, and the manual review path when a link exists without a locally saved checkout URL. Explain that production webhook registration requires a public HTTPS URL and local testing requires a tunnel or deployed endpoint.

- [ ] **Step 3: Update the Mermaid ERD**

Add `payment_attempt` 1:1 with `sales_order`, idempotency/fingerprint metadata, provider reference, payment lifecycle states, and paid-vs-employee confirmation semantics. Keep the no-inventory design and existing Supplier/Import history intact.

## Task 8: Verify the backend change and scope

**Files:**
- No additional file changes expected.

- [ ] **Step 1: Build the backend**

Run from `backend`: `npm run build`. Resolve compile/type errors.

- [ ] **Step 2: Run backend lint**

Run from `backend`: `npm run lint`. Resolve lint errors.

- [ ] **Step 3: Review migration ordering and status handling**

Inspect `npm run db:migrations` only if the worktree has a configured database URL; verify the new migration appears after existing migrations without applying it to a database implicitly. Review down-migration guards, webhook status checks, voucher release paths, and no checkout URL exposure on terminal/admin/list responses.

- [ ] **Step 4: Confirm frontend scope and working tree**

Run `git status --short` and inspect the diff. Confirm no `frontend/` paths changed and no credentials or local `.env` were added.
