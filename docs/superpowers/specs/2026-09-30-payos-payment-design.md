# PayOS Payment Design

## Goal

Add PayOS hosted checkout as the online payment option while preserving COD. The change is backend-only and keeps the TypeScript, NestJS, PostgreSQL, and TypeORM stack. Unpaid PayOS orders normally expire after 15 minutes and release their voucher redemption when PayOS confirms that a known, locally saved checkout link can no longer be paid. Exception: when a provider link exists but its checkout URL was never saved locally, retain the order and voucher for administrator review even if that orphan link is later confirmed unpaid/cancelled.

## Scope

- Extend customer order creation to select `cod` or `payos`; omitted `paymentMethod` remains `cod` for existing clients.
- Create a PayOS payment link for PayOS orders and return its checkout URL to the authenticated customer.
- Confirm online payment only through a verified PayOS webhook, matched to the local order and exact VND amount.
- Automatically expire known PayOS links and cancel unpaid orders after 15 minutes, releasing voucher quota through the existing cancelled-order counting rule. Orphan links without a locally saved checkout URL remain pending and reserved for administrator review, even if confirmed unpaid/cancelled.
- Keep manual employee payment confirmation for COD only. Require PayOS orders to be paid before an employee packs them; preserve existing COD packing behavior.
- Add PayOS persistence, migration, environment configuration, backend documentation, and update the current ERD.
- Do not change frontend files. Refunds, additional gateways, invoice creation, stock tracking, and customer-specific voucher limits are out of scope.

## Payment selection and amount rules

`POST /orders` accepts optional `paymentMethod` with values `cod` and `payos`. When omitted it is `cod`. PayOS order requests must include an `Idempotency-Key` header, generated once per checkout and reused for retries; a repeated request with the same customer, key, and canonical request fingerprint returns or reconciles the original order, while reusing the key with a different request returns `409 Conflict`. COD clients may omit the header. Clients cannot provide payment status, amount, checkout URL, PayOS order code, or provider reference.

All existing price and discount calculations remain in integer cents and support two decimal places. COD orders keep that behavior. For PayOS, the final server-calculated order total must be a whole VND amount (`totalCents % 100 = 0`) and, when positive, fit the exact integer range supported by JavaScript and PayOS. Otherwise, reject the request with `400 Bad Request` before writing the order or reserving a voucher. Never round the amount sent to PayOS. A zero-total PayOS order is settled locally as paid without creating a provider link or attempt; set `payment_confirmed_at`, leave the employee confirmer null, and keep the voucher redemption counted while the order is pending. PayOS documents `amount` as an integer and `expiredAt` as an Int32 Unix timestamp. See [PayOS API](https://payos.vn/docs/api/).

## Customer API behavior

- Extend `POST /orders` to create COD or PayOS orders. A positive-total PayOS order is created as `pending` and `unpaid`, and its payment attempt initially records that link creation is in progress. Persist the PayOS idempotency key and canonical request fingerprint with the order.
- On successful link creation, return the current order response plus `checkoutUrl` and `paymentExpiresAt`. For a zero-total PayOS order, return it as already paid without a checkout URL or payment attempt. A checkout URL saved locally is also included in the customer's own order detail response only while its payment attempt is `pending`. Do not include the URL in order lists or employee APIs, or after an attempt becomes terminal or requires reconciliation.
- COD responses and defaults remain backward compatible apart from reporting `paymentMethod: "cod"` consistently.
- Customer cancellation remains restricted to owned `pending`, `unpaid` orders with a `pending` PayOS attempt. A `reconciliation_required` attempt (including one without a locally saved checkout URL) cannot be cancelled by the customer and remains reserved for administrator review. For a cancellable PayOS order, first request provider cancellation and verify the provider's terminal unpaid/cancelled state; then in one transaction lock both rows, recheck the order is still `pending`/`unpaid` and the attempt is still `pending`, and set both order and attempt to `cancelled`. If PayOS reports paid, return `409 Conflict` and leave the order available for normal paid-order processing. If the provider cannot confirm cancellation, return a retryable service error and leave the local order and voucher reservation unchanged. If a concurrent webhook changes the order while the provider call is in flight, the locked recheck wins and no voucher is released by the stale cancellation request.
- A customer can place a new order after an expired PayOS order is cancelled. A cancelled/expired order cannot get a new payment link.

## PayOS integration and webhook

Use the official `@payos/node` SDK behind an injectable payment-provider boundary. This keeps PayOS-specific request and response types outside order-domain services and leaves room for future gateways. The SDK exposes payment-link creation and webhook verification. See [PayOS Node.js SDK](https://payos.vn/docs/sdks/back-end/node/) and [signature verification guide](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).

Use the local integer `orderId` as PayOS `orderCode`; the existing primary key is a positive PostgreSQL integer and each order has at most one PayOS attempt in this MVP. Use a short, deterministic payment description compatible with PayOS's documented 9-character limit for channels where it applies. Set the payment link expiration to the persisted 15-minute expiry timestamp.

Expose `POST /payments/payos/webhook` without customer or employee authentication. Verify the signature with the SDK before using the payload. Treat an event as a successful payment candidate only when top-level `success = true`, top-level `code = "00"`, nested `data.code = "00"`, and `data.currency = "VND"`. Match the PayOS order code, amount, and payment-link ID to the local attempt, then query PayOS's link status and require `status = PAID`, aggregate `amountPaid` equal to the expected order amount, and `amountRemaining = 0` before marking an order paid. This guards against treating an individual or partial transaction as full settlement. The PayOS webhook schema exposes success, codes, currency, and transaction reference; the link lookup API exposes overall status and aggregate paid/remaining amounts. See [PayOS webhook data](https://payos.vn/docs/du-lieu-tra-ve/webhook/) and [PayOS API](https://payos.vn/docs/api/).

After provider reconciliation, use one transaction to lock the order and attempt and recheck their current state. For a pending/unpaid order, mark the attempt paid, store the final transaction reference and observed aggregate paid amount, and set the order's `payment_status` and `payment_confirmed_at`; employee confirmer remains null. A duplicate with the same transaction reference is idempotent. If PayOS confirms full payment after the local order was cancelled, or a second successful reference arrives for an already-paid order, keep the order status unchanged, set the attempt to `reconciliation_required`, store the provider reference and amount, and expose an operator attention flag in admin order detail. Do not discard evidence of received funds. A browser return/cancel URL never confirms payment; it is only for navigation. See [PayOS Return URL](https://payos.vn/docs/du-lieu-tra-ve/return-url/).

An invalid signature must not change local payment state. A verified event that does not match a known order, link, currency, or amount is acknowledged without mutating an order and logged with only non-secret identifiers (`orderCode`, `paymentLinkId`, transaction `reference`, amount, currency, and mismatch reason); never log credentials, signature values, bank account details, or checkout URLs. Known attempts with a signed success candidate but incomplete or inconsistent provider settlement move to `reconciliation_required`, retain the reference and observed amount, and remain visible to administrators.

### Link-creation failure handling

For a positive-total PayOS order, create the order and its `creating` payment-attempt row in one database transaction before calling PayOS. A zero-total order bypasses PayOS and the payment-attempt table, and is marked paid in that transaction. After the provider call, save the payment-link ID and checkout URL and move the attempt to `pending`. Use the local order ID as the unique PayOS order code. Before retrying a create request, look up that order code. If the link URL was already saved locally, reuse that saved URL only after provider lookup confirms it is still pending, has zero paid, and has the full amount remaining. The PayOS lookup response does not contain `checkoutUrl`; never infer or construct the URL from the link ID. A duplicate order code response also triggers lookup. If the first call times out ambiguously, the request retry with the same `Idempotency-Key` returns the same order and attempts reconciliation rather than creating a new order or payment attempt.

Add a short setup lease to each `creating` attempt so a scheduler or second API request cannot issue a concurrent link-creation call while the original provider request may still be in flight. If PayOS confirms no link exists after the lease/reconciliation check and the order has not expired, the worker may retry link creation with the same order code. If provider lookup finds a link but its checkout URL was never saved locally (for example, PayOS created the link but the create response timed out), set the attempt to `reconciliation_required`, keep the order pending/unpaid and its voucher reserved, expose the attention flag to administrators, and do not return a URL, create a second link, or close the order automatically. A retry with the same idempotency key returns `503 Service Unavailable` while this state remains unresolved. Customer cancellation is also disallowed. The scheduler continues to reconcile this attempt; a provider-confirmed full payment follows the normal locked paid transition and clears the reconciliation state, while partial, unpaid, cancelled, or inconsistent link states remain flagged with the order and voucher reserved for administrator review. If provider state is unavailable or ambiguous, keep the order pending and the voucher reserved. A `creating` attempt is reconciled on scheduled runs before expiry; it is not selected only after 15 minutes. If no provider link exists and no payment is reported after the order deadline, mark the attempt failed/expired and cancel the local order in a transaction, releasing the voucher.

## Automatic expiration and cancellation

Add a NestJS scheduled worker that reconciles `creating` attempts whose setup lease has elapsed, unresolved `reconciliation_required` attempts, and pending attempts whose persisted 15-minute deadline has passed. For an expired pending attempt with a locally saved checkout URL, it asks PayOS for current link status and aggregate paid/remaining amounts, then requests cancellation when the link is still payable. Only when PayOS confirms full `PAID` settlement may the order be marked paid; only when PayOS confirms the known link is cancelled or otherwise no longer payable with zero amount paid may the worker mark the attempt terminal and order cancelled. The local `expired` attempt status records why the link was retired; it does not assume a provider status named `EXPIRED`. This automatic cancellation rule does not apply to orphan links whose checkout URL is missing locally. If lookup finds an orphan link, keep the order and voucher reservation for administrator reconciliation even when that link is still pending or has become unpaid/cancelled; do not infer the URL, create a replacement link, or automatically release the voucher. Continue checking that flagged attempt for later full payment; on a verified full aggregate payment, atomically mark the pending/unpaid order paid and clear the reconciliation reason. Other outcomes remain flagged and reserved until an administrator reviews them.

The worker and webhook use row locks and recheck local state before writing. After every external provider call, the worker and customer cancellation path must lock both rows and require order `status = pending`, `payment_status = unpaid`, and an eligible attempt state before changing either row. The customer cancellation path only accepts a `pending` attempt, never `reconciliation_required`. If a concurrent webhook has marked the order paid, do not cancel it or release its voucher. If PayOS is unreachable, reports partial funds, or returns an ambiguous state, leave the order pending, keep its voucher use reserved, and retry or expose a reconciliation flag. A full payment discovered for an already-cancelled order sets `reconciliation_required` on the attempt and does not silently alter the order status. The existing voucher rule counts orders in `pending` or `packed`, so changing a confirmed-unpaid expired order to `cancelled` releases the use exactly once without a separate counter. The scheduled worker runs every minute, so expiration processing may happen shortly after the exact 15-minute deadline.

## Employee order processing

- Admin order list/detail, packing, and COD confirmation routes require an active employee with role `order_staff` or `admin`; see the [employee role authorization matrix](2026-10-01-employee-role-authorization-design.md). A valid active employee without this role receives `403 Forbidden`.
- `POST /admin/orders/:orderId/pack` continues to permit pending unpaid COD orders.
- Packing a PayOS order requires `payment_status = paid`; reject unpaid PayOS orders with `409 Conflict`.
- `POST /admin/orders/:orderId/mark-paid` remains available only for COD orders. Employees cannot manually override PayOS state.
- Admin order details expose payment method, payment-attempt status, and a `paymentAttentionRequired` flag with safe reconciliation identifiers when needed, but never the checkout URL or PayOS credentials.

## Data model and migration

Extend `SalesOrderPaymentMethod` and the `sales_order.payment_method` check constraint to allow `cod` and `payos`. Update the payment-confirmation check so unpaid orders have no confirmation fields; paid COD orders require a confirmation timestamp and employee; paid PayOS orders require a confirmation timestamp and no employee. Preserve compatible nullable historical rows where allowed by the current schema.

Add nullable `idempotency_key` and `request_fingerprint` columns to `sales_order` for PayOS requests, plus a partial unique index on `(customer_id, idempotency_key)` when the key is not null. Idempotency keys are scoped to the authenticated customer. The fingerprint is a SHA-256 of canonical payment method, recipient/shipping fields, normalized voucher code, and sorted variant/quantity lines. Reusing a key for the same customer with a different fingerprint returns `409 Conflict`; a different customer has a separate key scope.

Add a one-to-one `payment_attempt` table for positive-total PayOS orders with:

- generated integer `payment_attempt_id` primary key;
- unique restrictive `order_id` FK to `sales_order`;
- `provider` (`payos` in this release), unique integer `provider_order_code`, nullable provider payment-link ID and checkout URL;
- integer-compatible exact `amount` in whole VND;
- `status` (`creating`, `pending`, `paid`, `cancelled`, `expired`, `failed`, or `reconciliation_required`);
- nullable `provider_reference`, nullable `observed_amount_paid`, nullable reconciliation reason/time, setup-lease expiry, `expires_at`, nullable `paid_at`, `created_at`, and `updated_at` timestamps.

Add checks for supported provider/status values and positive amount, a unique constraint for a non-null provider transaction reference, plus indexes supporting setup reconciliation and expiry worker scans. Store no API keys or checksum keys in the database. The migration is additive and must preserve existing COD orders and their payment-confirmation data. Its `down` migration must abort if any PayOS order or payment-attempt row exists; it must not silently convert or discard online payment history.

## Configuration and operations

Add these placeholders to `.env.example` and document them in `backend/README.md`:

- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- `PAYOS_RETURN_URL`
- `PAYOS_CANCEL_URL`

The webhook route must be reachable over HTTPS for a deployed environment and registered with the PayOS payment channel. Local end-to-end webhook validation needs a public HTTPS tunnel or deployed test endpoint. Credentials are supplied through local environment configuration and are never committed. Missing PayOS configuration must not break COD API usage; a positive-total PayOS checkout request without configuration returns a service-unavailable error before an order is created. A zero-total PayOS order requires no provider configuration because no payment link is created.

## Errors and response behavior

- Unsupported `paymentMethod`, fractional-VND PayOS total, or amount outside the exact integer range supported by the provider: `400 Bad Request`, with no order, detail, attempt, or voucher reservation.
- Missing `Idempotency-Key` on PayOS order creation, or reusing a key with a different request fingerprint: `400 Bad Request` or `409 Conflict`, respectively.
- PayOS not configured: `503 Service Unavailable`, before creating the order.
- Provider timeout with unknown state: `503 Service Unavailable`; keep the persisted order/attempt pending for reconciliation and keep the voucher reserved. Retrying with the same key returns/reconciles this order.
- Provider link found by lookup but checkout URL was never saved: set the attempt to `reconciliation_required`, keep the order pending/unpaid and voucher reserved, return `503` on customer retry, disallow customer cancellation, and expose operator attention. Never infer the URL or create a replacement link. The scheduler continues checking for full payment and settles it atomically if confirmed; all unpaid/cancelled outcomes remain reserved for administrator review.
- Customer cancellation or packing conflict, including attempting to pack unpaid PayOS: `409 Conflict`.
- Invalid webhook signature: reject without state change.
- Verified matching successful webhook: return 2xx; repeated success webhook stays idempotent.
- PayOS network errors during cancellation/expiry: retry later and do not release the voucher.

## Acceptance criteria

- Existing order clients that omit `paymentMethod` continue to create unpaid COD orders.
- PayOS order creation rejects fractional VND and positive values outside the exact safe integer range before reserving a voucher; zero-total PayOS orders are locally settled without calling PayOS.
- Successful PayOS order creation returns an owned checkout URL and uses a 15-minute provider expiration.
- Only a verified, provider-reconciled, amount-matched PayOS success webhook marks a PayOS order paid; invalid, mismatched, or duplicate events cannot corrupt local state, and late confirmed payment on a cancelled order is durably flagged for operator reconciliation.
- Customer cancellation and automatic expiry release voucher quota for known links with a locally saved URL only after PayOS confirms the link is no longer payable. Orphan links without a locally saved checkout URL remain pending and reserved for administrator review even if confirmed unpaid/cancelled.
- PayOS outage or ambiguous provider state does not incorrectly cancel an order or release its voucher reservation. Retrying a PayOS create request with the same idempotency key returns the same order and does not consume another voucher use. If a provider link exists but its checkout URL was never persisted, the order is flagged for administrator reconciliation and remains pending with the voucher reserved; retry returns `503`, customer cancellation is disallowed, the URL is never inferred, and no replacement link is created. Scheduler/webhook reconciliation can still settle a later verified full payment.
- Active `order_staff` or `admin` employees can pack paid PayOS orders; they cannot pack unpaid PayOS orders or manually mark PayOS orders paid. COD workflow remains intact.
- The migration, entities, API behavior, environment docs, and ERD agree. No frontend files change.
