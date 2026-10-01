import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must point to a dedicated *_test database.',
  );
}

const databaseName = decodeURIComponent(
  new URL(testDatabaseUrl).pathname.slice(1),
);
if (!databaseName.toLowerCase().endsWith('_test')) {
  throw new Error(
    'Refusing to run against a database whose name does not end in _test.',
  );
}

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const { BadRequestException } = require('@nestjs/common');

class FakePaymentProvider {
  links = new Map();
  createCalls = 0;
  getCalls = 0;
  cancelCalls = 0;
  failCreate = false;
  failGet = false;

  reset() {
    this.links.clear();
    this.createCalls = 0;
    this.getCalls = 0;
    this.cancelCalls = 0;
    this.failCreate = false;
    this.failGet = false;
  }

  isConfigured() {
    return true;
  }

  async createLink(input) {
    this.createCalls += 1;
    if (this.failCreate) throw new Error('simulated PayOS create timeout');
    const link = {
      linkId: `fake-link-${input.orderCode}`,
      checkoutUrl: `https://payos.test/checkout/${input.orderCode}`,
      status: 'PENDING',
      amount: input.amount,
      amountPaid: 0,
      amountRemaining: input.amount,
      currency: 'VND',
      orderCode: input.orderCode,
      transactionReferences: [],
    };
    this.links.set(input.orderCode, link);
    return structuredClone(link);
  }

  async getLink(orderCode) {
    this.getCalls += 1;
    if (this.failGet) throw new Error('simulated PayOS lookup timeout');
    const link = this.links.get(orderCode);
    return link ? structuredClone(link) : null;
  }

  async cancelLink(orderCode) {
    this.cancelCalls += 1;
    const link = this.links.get(orderCode);
    if (!link) throw new Error('fake payment link not found');
    link.status = 'CANCELLED';
    return structuredClone(link);
  }

  async verifyWebhook(payload) {
    if (payload?.signature !== 'valid-test-signature') {
      throw new BadRequestException('Invalid fake signature.');
    }
    return structuredClone(payload.event);
  }
}

const provider = new FakePaymentProvider();
let dataSource;
let database;
let payments;
let invoices;
let orders;
let adminOrders;
let customerOneId;
let customerTwoId;
let variantId;

before(
  async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    const dataSourceModule = require(
      path.join(backendDirectory, 'dist', 'database', 'data-source.js'),
    );
    dataSource = dataSourceModule.default;
    await dataSource.initialize();

    const { Client } = require('pg');
    database = new Client({ connectionString: testDatabaseUrl });
    await database.connect();

    const { PaymentsService } = require(
      path.join(backendDirectory, 'dist', 'payments', 'payments.service.js'),
    );
    const { InvoicesService } = require(
      path.join(backendDirectory, 'dist', 'invoices', 'invoices.service.js'),
    );
    const { OrdersService } = require(
      path.join(backendDirectory, 'dist', 'orders', 'orders.service.js'),
    );
    const { AdminOrdersService } = require(
      path.join(backendDirectory, 'dist', 'orders', 'admin-orders.service.js'),
    );
    invoices = new InvoicesService(dataSource);
    payments = new PaymentsService(provider, dataSource, invoices);
    orders = new OrdersService(dataSource, payments, invoices);
    adminOrders = new AdminOrdersService(dataSource, invoices);

    const customers = await database.query(
      `INSERT INTO customer (name, email, password_hash)
     VALUES ('PayOS Test Customer 1', $1, 'test-hash'),
            ('PayOS Test Customer 2', $2, 'test-hash')
     RETURNING customer_id`,
      [
        `payos-test-1-${Date.now()}@example.com`,
        `payos-test-2-${Date.now()}@example.com`,
      ],
    );
    customerOneId = Number(customers.rows[0].customer_id);
    customerTwoId = Number(customers.rows[1].customer_id);

    const category = await database.query(
      `INSERT INTO category (name) VALUES ($1) RETURNING category_id`,
      [`PayOS Test Category ${Date.now()}`],
    );
    const product = await database.query(
      `INSERT INTO product (name, status, category_id) VALUES ($1, 'active', $2) RETURNING product_id`,
      [`PayOS Test Product ${Date.now()}`, category.rows[0].category_id],
    );
    const variant = await database.query(
      `INSERT INTO product_variant (size, color, price, product_id)
     VALUES ('M', 'Test', 1000.00, $1) RETURNING variant_id`,
      [product.rows[0].product_id],
    );
    variantId = Number(variant.rows[0].variant_id);
  },
  { timeout: 30_000 },
);

beforeEach(() => provider.reset());

after(async () => {
  if (database) await database.end();
  if (dataSource?.isInitialized) await dataSource.destroy();
});

function voucherCode(label) {
  return `PAYOS_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

async function createVoucher(label, quantity = 1) {
  const promotion = await database.query(
    `INSERT INTO promotion (name, start_date, end_date, status)
     VALUES ($1, CURRENT_DATE - 1, CURRENT_DATE + 1, 'active') RETURNING promotion_id`,
    [`PayOS Test Promotion ${label} ${Date.now()}`],
  );
  const code = voucherCode(label);
  await database.query(
    `INSERT INTO promotion_detail
       (promotion_id, code, name, type, discount_value, start_date, end_date, min_price, quantity, status)
     VALUES ($1, $2, $3, 'fixed', 200.00, CURRENT_DATE - 1, CURRENT_DATE + 1, 0.00, $4, 'active')`,
    [promotion.rows[0].promotion_id, code, `Test voucher ${label}`, quantity],
  );
  return code;
}

function orderInput({ voucherCode: code } = {}) {
  return {
    paymentMethod: 'payos',
    recipientName: 'PayOS Test Recipient',
    recipientPhone: '0900000000',
    shippingAddress: '1 PayOS Test Street',
    details: [{ variantId, quantity: 1 }],
    ...(code ? { voucherCode: code } : {}),
  };
}

async function createPayosOrder(customerId = customerOneId, options = {}) {
  const input = orderInput(options);
  const idempotencyKey =
    options.idempotencyKey ?? `payos-${Date.now()}-${Math.random()}`;
  const response = await orders.createOrder(input, customerId, idempotencyKey);
  return { response, input, idempotencyKey };
}

async function loadOrderState(orderId) {
  const result = await database.query(
    `SELECT o.order_id, o.payment_status, o.status AS order_status,
            pa.status AS attempt_status, pa.provider_order_code, pa.provider_payment_link_id,
            pa.checkout_url, pa.amount, pa.observed_amount_paid, pa.reconciliation_reason
       FROM sales_order o JOIN payment_attempt pa ON pa.order_id = o.order_id
      WHERE o.order_id = $1`,
    [orderId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

function webhookFor(state, amount, reference = `fake-ref-${state.order_id}`) {
  return {
    signature: 'valid-test-signature',
    event: {
      success: true,
      code: '00',
      data: {
        orderCode: Number(state.provider_order_code),
        amount,
        reference,
        currency: 'VND',
        paymentLinkId: state.provider_payment_link_id,
        code: '00',
      },
    },
  };
}

function toVnd(amount) {
  return Number(amount);
}

test('handles concurrent duplicate full-payment webhooks and issues one invoice', async () => {
  const { response } = await createPayosOrder();
  const state = await loadOrderState(response.orderId);
  const amount = toVnd(state.amount);
  const link = provider.links.get(response.orderId);
  Object.assign(link, {
    status: 'PAID',
    amountPaid: amount,
    amountRemaining: 0,
    transactionReferences: [`fake-ref-${response.orderId}`],
  });

  const webhookResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      payments.handleWebhook(webhookFor(state, amount)),
    ),
  );
  assert.deepEqual(
    webhookResults,
    Array.from({ length: 5 }, () => ({ success: true })),
  );

  const paid = await loadOrderState(response.orderId);
  assert.equal(paid.payment_status, 'paid');
  assert.equal(paid.attempt_status, 'paid');
  assert.equal(
    Number(
      (
        await database.query(
          'SELECT COUNT(*) FROM invoice WHERE order_id = $1',
          [response.orderId],
        )
      ).rows[0].count,
    ),
    1,
  );
});

test('rejects an invalid webhook signature without querying PayOS or changing the order', async () => {
  const { response } = await createPayosOrder();
  const state = await loadOrderState(response.orderId);
  const getCallsBefore = provider.getCalls;

  await assert.rejects(
    payments.handleWebhook({
      ...webhookFor(state, toVnd(state.amount)),
      signature: 'invalid-signature',
    }),
    (error) => error.getStatus?.() === 400,
  );

  assert.equal(provider.getCalls, getCallsBefore);
  const unchanged = await loadOrderState(response.orderId);
  assert.equal(unchanged.payment_status, 'unpaid');
  assert.equal(unchanged.order_status, 'pending');
  assert.equal(unchanged.attempt_status, 'pending');
});

test('flags a signed partial-payment webhook for review and keeps its voucher reserved', async () => {
  const code = await createVoucher('PARTIAL');
  const { response } = await createPayosOrder(customerOneId, {
    voucherCode: code,
  });
  const state = await loadOrderState(response.orderId);
  const amount = toVnd(state.amount);
  const partialAmount = Math.floor(amount / 2);
  const reference = `partial-ref-${response.orderId}`;
  const link = provider.links.get(response.orderId);
  Object.assign(link, {
    status: 'UNDERPAID',
    amountPaid: partialAmount,
    amountRemaining: amount - partialAmount,
    transactionReferences: [reference],
  });

  await payments.handleWebhook(webhookFor(state, partialAmount, reference));

  const flagged = await loadOrderState(response.orderId);
  assert.equal(flagged.payment_status, 'unpaid');
  assert.equal(flagged.order_status, 'pending');
  assert.equal(flagged.attempt_status, 'reconciliation_required');
  assert.ok(flagged.reconciliation_reason);
  assert.equal(
    Number(
      (
        await database.query(
          'SELECT COUNT(*) FROM invoice WHERE order_id = $1',
          [response.orderId],
        )
      ).rows[0].count,
    ),
    0,
  );
  await assert.rejects(
    createPayosOrder(customerTwoId, { voucherCode: code }),
    (error) => error.getStatus?.() === 400,
  );
});

test('keeps the order and voucher reserved when creating a payment link times out', async () => {
  const code = await createVoucher('TIMEOUT');
  provider.failCreate = true;
  provider.failGet = true;
  const idempotencyKey = `timeout-${Date.now()}`;

  await assert.rejects(
    createPayosOrder(customerOneId, { voucherCode: code, idempotencyKey }),
    (error) => error.getStatus?.() === 503,
  );

  const result = await database.query(
    `SELECT o.order_id FROM sales_order o JOIN payment_attempt pa ON pa.order_id = o.order_id
      WHERE o.customer_id = $1 AND o.idempotency_key = $2`,
    [customerOneId, idempotencyKey],
  );
  assert.equal(result.rowCount, 1);
  const orderId = Number(result.rows[0].order_id);
  const state = await loadOrderState(orderId);
  assert.equal(state.payment_status, 'unpaid');
  assert.equal(state.order_status, 'pending');
  assert.equal(state.attempt_status, 'reconciliation_required');
  assert.equal(state.provider_payment_link_id, null);
  assert.equal(state.checkout_url, null);
  assert.ok(state.reconciliation_reason);
  assert.equal(
    (await adminOrders.getOrder(String(orderId))).paymentAttentionRequired,
    true,
  );
  await assert.rejects(
    createPayosOrder(customerTwoId, { voucherCode: code }),
    (error) => error.getStatus?.() === 400,
  );
});

test('cancels an expired link only after the fake provider confirms terminal unpaid status', async () => {
  const code = await createVoucher('EXPIRED');
  const { response } = await createPayosOrder(customerOneId, {
    voucherCode: code,
  });
  await database.query(
    `UPDATE payment_attempt SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
                                setup_lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
      WHERE order_id = $1`,
    [response.orderId],
  );

  await payments.reconcileScheduledAttempts();

  const expired = await loadOrderState(response.orderId);
  assert.equal(provider.cancelCalls, 1);
  assert.equal(expired.order_status, 'cancelled');
  assert.equal(expired.attempt_status, 'cancelled');
  assert.equal(expired.payment_status, 'unpaid');

  const replacement = await orders.createOrder(
    { ...orderInput({ voucherCode: code }), paymentMethod: 'cod' },
    customerTwoId,
  );
  assert.equal(replacement.status, 'pending');
  assert.equal(replacement.voucherCode, code);
});

test('reuses a PayOS order for the same idempotency key and rejects a different payload', async () => {
  const code = await createVoucher('IDEMPOTENT', 2);
  const input = orderInput({ voucherCode: code });
  const idempotencyKey = `same-${Date.now()}`;
  const first = await orders.createOrder(input, customerOneId, idempotencyKey);
  const second = await orders.createOrder(input, customerOneId, idempotencyKey);

  assert.equal(second.orderId, first.orderId);
  assert.equal(provider.createCalls, 1);
  assert.equal(
    Number(
      (
        await database.query(
          'SELECT COUNT(*) FROM sales_order WHERE customer_id = $1 AND idempotency_key = $2',
          [customerOneId, idempotencyKey],
        )
      ).rows[0].count,
    ),
    1,
  );
  assert.equal(
    Number(
      (
        await database.query(
          'SELECT COUNT(*) FROM payment_attempt WHERE order_id = $1',
          [first.orderId],
        )
      ).rows[0].count,
    ),
    1,
  );

  await assert.rejects(
    orders.createOrder(
      { ...input, details: [{ variantId, quantity: 2 }] },
      customerOneId,
      idempotencyKey,
    ),
    (error) => error.getStatus?.() === 409,
  );
  assert.equal(provider.createCalls, 1);
});
