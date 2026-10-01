import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated *_test database.');
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
if (!databaseName.toLowerCase().endsWith('_test')) {
  throw new Error('Refusing to run against a database whose name does not end in _test.');
}

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { PasswordService } = require('../dist/auth/password.service.js');

const employeePassword = 'Employee-Test-Password-2026!';
const customerPassword = 'Customer-Test-Password-2026!';
const employeeName = 'Test Employee';
const employeeRoles = [
  'admin',
  'catalog_manager',
  'promotion_manager',
  'order_staff',
  'purchasing_staff',
  'unassigned',
];
const employeeAccessRoutes = [
  { path: '/categories', roles: ['catalog_manager'] },
  { path: '/products', roles: ['catalog_manager'] },
  { path: '/products/PRODUCT_ID/variants', roles: ['catalog_manager'] },
  { path: '/promotions', roles: ['promotion_manager'] },
  {
    path: '/promotions/PROMOTION_ID/vouchers',
    roles: ['promotion_manager'],
  },
  { path: '/admin/orders', roles: ['order_staff'] },
  { path: '/suppliers', roles: ['purchasing_staff'] },
  { path: '/imports', roles: ['purchasing_staff'] },
];

let childProcess;
let serverOutput = '';
let baseUrl;
let employeeToken;
let unassignedEmployeeToken;
const employeeTokens = {};
const employeeLogins = {};
let adminEmployeeLogin;
let unassignedEmployeeLogin;
let customerOneToken;
let customerTwoToken;
let productId;
let productVariantId;
let promotionId;

function appendServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk.toString()}`.slice(-12_000);
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not reserve a local test port.');
  }
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForBackend() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
      throw new Error(`Backend exited before becoming ready.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 200) return;
    } catch {
      // The Nest process may still be initializing its database connection.
    }
    await delay(200);
  }
  throw new Error(`Backend did not become ready within 45 seconds.\n${serverOutput}`);
}

async function startBackend() {
  const port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  childProcess = spawn(process.execPath, [path.join(backendDirectory, 'dist', 'main.js')], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-only-jwt-secret-never-use-outside-tests',
      PORT: String(port),
      PAYOS_CLIENT_ID: '',
      PAYOS_API_KEY: '',
      PAYOS_CHECKSUM_KEY: '',
      PAYOS_RETURN_URL: '',
      PAYOS_CANCEL_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  childProcess.stdout.on('data', appendServerOutput);
  childProcess.stderr.on('data', appendServerOutput);
  await waitForBackend();
}

async function stopBackend() {
  if (!childProcess || childProcess.exitCode !== null) return;
  const exited = once(childProcess, 'exit');
  if (process.platform === 'win32') {
    await execFileAsync('taskkill.exe', ['/PID', String(childProcess.pid), '/T', '/F']);
  } else {
    childProcess.kill('SIGTERM');
  }
  await Promise.race([exited, delay(5_000)]);
  if (childProcess.exitCode === null) {
    throw new Error(`Could not stop the test backend.\n${serverOutput}`);
  }
}

async function seedEmployee({ email, password, role }) {
  const passwordHash = await new PasswordService().hash(password);
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO employee (name, email, password_hash, position, role, status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [employeeName, email, passwordHash, 'Staff', role, 'active'],
    );
  } finally {
    await client.end();
  }
}

async function api(pathname, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

async function registerCustomer(name) {
  const response = await api('/auth/customer/register', {
    method: 'POST',
    body: {
      name,
      email: `customer-${randomUUID()}@example.com`,
      password: customerPassword,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(typeof response.body.access_token, 'string');
  return response.body.access_token;
}

async function createVoucher({ quantity, discountValue }) {
  const code = `T${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const response = await api(`/promotions/${promotionId}/vouchers`, {
    method: 'POST',
    token: employeeToken,
    body: {
      code: code.toLowerCase(),
      name: `Test voucher ${code}`,
      type: 'fixed',
      discountValue,
      startDate: dateOffset(-3),
      endDate: dateOffset(3),
      minPrice: '0.00',
      quantity,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.code, code);
  return code;
}

function placeOrder(customerToken, overrides = {}) {
  return api('/orders', {
    method: 'POST',
    token: customerToken,
    body: {
      recipientName: 'Test Recipient',
      recipientPhone: '0900000000',
      shippingAddress: '1 Test Street, Ho Chi Minh City',
      details: [{ variantId: productVariantId, quantity: 1 }],
      ...overrides,
    },
  });
}

function dateOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

before(async () => {
  await startBackend();
  const rootResponse = await api('/');
  assert.equal(rootResponse.status, 200);

  const employeeCredentials = {};
  for (const role of employeeRoles) {
    const email = `employee-${role}-${randomUUID()}@example.com`;
    employeeCredentials[role] = { email, password: employeePassword };
    await seedEmployee({ email, password: employeePassword, role });
  }

  for (const role of employeeRoles) {
    const login = await api('/auth/employee/login', {
      method: 'POST',
      body: employeeCredentials[role],
    });
    assert.equal(login.status, 200, `${role}: ${JSON.stringify(login.body)}`);
    assert.equal(login.body.employee.role, role);
    employeeLogins[role] = login;
    employeeTokens[role] = login.body.access_token;
  }

  adminEmployeeLogin = employeeLogins.admin;
  unassignedEmployeeLogin = employeeLogins.unassigned;
  employeeToken = employeeTokens.admin;
  unassignedEmployeeToken = employeeTokens.unassigned;

  customerOneToken = await registerCustomer('Customer One');
  customerTwoToken = await registerCustomer('Customer Two');

  const category = await api('/categories', {
    method: 'POST',
    token: employeeToken,
    body: { name: `Test category ${randomUUID()}` },
  });
  assert.equal(category.status, 201, JSON.stringify(category.body));

  const product = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Test product ${randomUUID()}`,
      status: 'active',
      categoryId: category.body.categoryId,
    },
  });
  assert.equal(product.status, 201, JSON.stringify(product.body));
  productId = product.body.productId;

  const variant = await api(`/products/${productId}/variants`, {
    method: 'POST',
    token: employeeToken,
    body: { size: 'M', color: 'Black', price: 1000 },
  });
  assert.equal(variant.status, 201, JSON.stringify(variant.body));
  productVariantId = variant.body.variantId;

  const promotion = await api('/promotions', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Test campaign ${randomUUID()}`,
      startDate: dateOffset(-3),
      endDate: dateOffset(3),
    },
  });
  assert.equal(promotion.status, 201, JSON.stringify(promotion.body));
  promotionId = promotion.body.promotionId;
}, { timeout: 60_000 });

after(async () => {
  await stopBackend();
}, { timeout: 10_000 });

test('enforces customer and employee token boundaries', async () => {
  assert.equal((await api('/orders')).status, 401);
  assert.equal((await api('/orders', { token: employeeToken })).status, 401);
  assert.equal((await api('/admin/orders', { token: customerOneToken })).status, 401);
  assert.equal((await api('/categories', { token: customerOneToken })).status, 401);
  assert.equal((await api('/promotions', { token: customerOneToken })).status, 401);
  assert.equal((await api('/auth/customer/profile', { token: employeeToken })).status, 401);
  assert.equal((await api('/auth/employee/profile', { token: customerOneToken })).status, 401);
  assert.equal((await api('/auth/customer/profile', { token: customerOneToken })).status, 200);
  assert.equal((await api('/auth/employee/profile', { token: employeeToken })).status, 200);
});

test('returns database employee roles on login and profile', async () => {
  assert.equal(adminEmployeeLogin.body.employee.role, 'admin');
  assert.equal(unassignedEmployeeLogin.body.employee.role, 'unassigned');

  const adminProfile = await api('/auth/employee/profile', {
    token: employeeToken,
  });
  const unassignedProfile = await api('/auth/employee/profile', {
    token: unassignedEmployeeToken,
  });

  assert.equal(adminProfile.status, 200, JSON.stringify(adminProfile.body));
  assert.equal(adminProfile.body.role, 'admin');
  assert.equal(
    unassignedProfile.status,
    200,
    JSON.stringify(unassignedProfile.body),
  );
  assert.equal(unassignedProfile.body.role, 'unassigned');
});

test('enforces employee role access for each business module', async () => {
  for (const route of employeeAccessRoutes) {
    const pathname = route.path
      .replace('PRODUCT_ID', String(productId))
      .replace('PROMOTION_ID', String(promotionId));

    for (const role of employeeRoles) {
      const response = await api(pathname, { token: employeeTokens[role] });
      const expectedStatus = role === 'admin' || route.roles.includes(role) ? 200 : 403;
      assert.equal(
        response.status,
        expectedStatus,
        `${role} ${pathname}: expected ${expectedStatus}, got ${response.status} (${JSON.stringify(response.body)})`,
      );
    }

    const customerResponse = await api(pathname, { token: customerOneToken });
    assert.equal(
      customerResponse.status,
      401,
      `customer ${pathname}: ${JSON.stringify(customerResponse.body)}`,
    );
  }

  assert.equal((await api('/store/products')).status, 200);
});

test('creates orders from server prices and hides another customer’s order', async () => {
  const created = await placeOrder(customerOneToken, {
    details: [{ variantId: productVariantId, quantity: 2 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.paymentMethod, 'cod');
  assert.equal(created.body.paymentStatus, 'unpaid');
  assert.equal(created.body.totalAmount, '2000.00');
  assert.equal(created.body.details[0].unitPrice, '1000.00');

  assert.equal(
    (await api(`/orders/${created.body.orderId}`, { token: customerTwoToken })).status,
    404,
  );

  const firstCustomerOrders = await api('/orders', { token: customerOneToken });
  const secondCustomerOrders = await api('/orders', { token: customerTwoToken });
  assert.equal(firstCustomerOrders.status, 200);
  assert.equal(firstCustomerOrders.body.items.length, 1);
  assert.equal(secondCustomerOrders.status, 200);
  assert.equal(secondCustomerOrders.body.total, 0);

  const forgedPrice = await placeOrder(customerOneToken, {
    totalAmount: '1.00',
    details: [{ variantId: productVariantId, quantity: 1, unitPrice: '0.01' }],
  });
  assert.equal(forgedPrice.status, 400);
  assert.equal((await api('/orders', { token: customerOneToken })).body.total, 1);
});

test('enforces shared voucher limits atomically and releases a reservation on cancellation', async () => {
  const voucherCode = await createVoucher({ quantity: 1, discountValue: '250.00' });
  const [firstAttempt, secondAttempt] = await Promise.all([
    placeOrder(customerOneToken, { voucherCode: ` ${voucherCode.toLowerCase()} ` }),
    placeOrder(customerTwoToken, { voucherCode }),
  ]);

  const success = firstAttempt.status === 201 ? firstAttempt : secondAttempt;
  const rejected = firstAttempt.status === 400 ? firstAttempt : secondAttempt;
  assert.equal(success.status, 201, JSON.stringify(success.body));
  assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  assert.equal(success.body.discountAmount, '250.00');
  assert.equal(success.body.totalAmount, '750.00');

  const winningToken = firstAttempt.status === 201 ? customerOneToken : customerTwoToken;
  const retryToken = firstAttempt.status === 201 ? customerTwoToken : customerOneToken;
  const orderId = success.body.orderId;
  const cancelled = await api(`/orders/${orderId}/cancel`, {
    method: 'POST',
    token: winningToken,
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.status, 'cancelled');

  const retry = await placeOrder(retryToken, { voucherCode });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.discountAmount, '250.00');
  assert.equal(retry.body.totalAmount, '750.00');
});

test('issues one invoice only after COD payment and enforces invoice ownership', async () => {
  const created = await placeOrder(customerOneToken);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const orderId = created.body.orderId;

  assert.equal(
    (await api(`/orders/${orderId}/invoice`, { token: customerOneToken })).status,
    404,
  );

  const packed = await api(`/admin/orders/${orderId}/pack`, {
    method: 'POST',
    token: employeeToken,
    body: { packingType: 'bag' },
  });
  assert.equal(packed.status, 200, JSON.stringify(packed.body));
  assert.equal(
    (await api(`/orders/${orderId}/invoice`, { token: customerOneToken })).status,
    404,
  );

  const paid = await api(`/admin/orders/${orderId}/mark-paid`, {
    method: 'POST',
    token: employeeToken,
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.paymentStatus, 'paid');

  const customerInvoice = await api(`/orders/${orderId}/invoice`, {
    token: customerOneToken,
  });
  const adminInvoice = await api(`/admin/orders/${orderId}/invoice`, {
    token: employeeToken,
  });
  const orderStaffInvoice = await api(`/admin/orders/${orderId}/invoice`, {
    token: employeeTokens.order_staff,
  });
  const catalogManagerInvoice = await api(`/admin/orders/${orderId}/invoice`, {
    token: employeeTokens.catalog_manager,
  });
  assert.equal(customerInvoice.status, 200, JSON.stringify(customerInvoice.body));
  assert.equal(adminInvoice.status, 200, JSON.stringify(adminInvoice.body));
  assert.equal(
    orderStaffInvoice.status,
    200,
    JSON.stringify(orderStaffInvoice.body),
  );
  assert.equal(catalogManagerInvoice.status, 403);
  assert.equal(customerInvoice.body.status, 'issued');
  assert.equal(customerInvoice.body.totalAmount, '1000.00');
  assert.equal(adminInvoice.body.invoiceId, customerInvoice.body.invoiceId);
  assert.equal(adminInvoice.body.orderId, orderId);

  assert.equal(
    (await api(`/orders/${orderId}/invoice`, { token: customerTwoToken })).status,
    404,
  );
  assert.equal(
    (await api(`/orders/${orderId}/invoice`, { token: employeeToken })).status,
    401,
  );
  assert.equal(
    (await api(`/admin/orders/${orderId}/invoice`, { token: customerOneToken })).status,
    401,
  );
  assert.equal(
    (await api(`/admin/orders/${orderId}/mark-paid`, {
      method: 'POST',
      token: employeeToken,
    })).status,
    409,
  );
  const invoiceAgain = await api(`/orders/${orderId}/invoice`, {
    token: customerOneToken,
  });
  assert.equal(invoiceAgain.body.invoiceId, customerInvoice.body.invoiceId);
});
