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
const { Reflector } = require('@nestjs/core');
const { EmployeeRolesGuard } = require('../dist/auth/employee-roles.guard.js');
const { EmployeeRoles } = require('../dist/auth/employee-roles.decorator.js');

const employeeEmail = `employee-${randomUUID()}@example.com`;
const employeePassword = 'Employee-Test-Password-2026!';
const customerPassword = 'Customer-Test-Password-2026!';
const employeeName = 'Test Employee';
const managerEmployeeEmail = `manager-${randomUUID()}@example.com`;
const managerEmployeeName = 'Manager Employee';
const employeeRoles = ['admin', 'manager'];
const roleEmployeeTokens = new Map();

let childProcess;
let serverOutput = '';
let baseUrl;
let employeeToken;
let managerEmployeeToken;
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

async function seedEmployee({ email = employeeEmail, name = employeeName, role }) {
  const passwordHash = await new PasswordService().hash(employeePassword);
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO employee (name, email, password_hash, position, status, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, passwordHash, role === 'admin' ? 'admin' : 'operator', 'active', role],
    );
  } finally {
    await client.end();
  }
}

async function updateEmployeeRole(email, role) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query('UPDATE employee SET role = $1 WHERE email = $2', [role, email]);
  } finally {
    await client.end();
  }
}

async function employeeIdForEmail(email) {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      'SELECT employee_id FROM employee WHERE email = $1',
      [email],
    );
    assert.equal(result.rowCount, 1, `Expected employee ${email} to exist`);
    return Number(result.rows[0].employee_id);
  } finally {
    await client.end();
  }
}

async function activeAdminCount() {
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT COUNT(*)::integer AS count FROM employee WHERE role = 'admin' AND status = 'active'",
    );
    return result.rows[0].count;
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

function employeeRoleContext(handler, controller, role) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ employee: role === undefined ? undefined : { role } }),
    }),
  };
}

before(async () => {
  await startBackend();
  const rootResponse = await api('/');
  assert.equal(rootResponse.status, 200);

  await seedEmployee({ role: 'admin' });
  const employeeLogin = await api('/auth/employee/login', {
    method: 'POST',
    body: { email: employeeEmail, password: employeePassword },
  });
  assert.equal(employeeLogin.status, 200, JSON.stringify(employeeLogin.body));
  assert.equal(employeeLogin.body.employee.role, 'admin');
  employeeToken = employeeLogin.body.access_token;
  roleEmployeeTokens.set('admin', employeeToken);

  await seedEmployee({
    email: managerEmployeeEmail,
    name: managerEmployeeName,
    role: 'manager',
  });

  const managerEmployeeLogin = await api('/auth/employee/login', {
    method: 'POST',
    body: { email: managerEmployeeEmail, password: employeePassword },
  });
  assert.equal(managerEmployeeLogin.status, 200, JSON.stringify(managerEmployeeLogin.body));
  assert.equal(managerEmployeeLogin.body.employee.role, 'manager');
  managerEmployeeToken = managerEmployeeLogin.body.access_token;
  roleEmployeeTokens.set('manager', managerEmployeeToken);

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
  const adminProfile = await api('/auth/employee/profile', { token: employeeToken });
  assert.equal(adminProfile.status, 200);
  assert.equal(adminProfile.body.role, 'admin');

  const managerProfile = await api('/auth/employee/profile', {
    token: managerEmployeeToken,
  });
  assert.equal(managerProfile.status, 200);
  assert.equal(managerProfile.body.role, 'manager');
  assert.equal(managerProfile.body.email, managerEmployeeEmail);
});

test('enforces the employee role matrix across business read endpoints', async () => {
  const endpoints = [
    '/categories',
    '/products',
    `/products/${productId}/variants`,
    '/promotions',
    `/promotions/${promotionId}/vouchers`,
    '/admin/orders',
    '/suppliers',
    '/imports',
  ];

  for (const endpoint of endpoints) {
    for (const role of employeeRoles) {
      const response = await api(endpoint, { token: roleEmployeeTokens.get(role) });
      assert.equal(
        response.status,
        200,
        `${role} access to ${endpoint}: ${JSON.stringify(response.body)}`,
      );
    }

    assert.equal(
      (await api(endpoint, { token: customerOneToken })).status,
      401,
      `Customer access to ${endpoint} must remain unauthorized`,
    );
  }

  const publicStorefront = await api('/store/products');
  assert.equal(publicStorefront.status, 200, JSON.stringify(publicStorefront.body));
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
    token: managerEmployeeToken,
    body: { packingType: 'bag' },
  });
  assert.equal(packed.status, 200, JSON.stringify(packed.body));
  assert.equal(
    (await api(`/orders/${orderId}/invoice`, { token: customerOneToken })).status,
    404,
  );

  const paid = await api(`/admin/orders/${orderId}/mark-paid`, {
    method: 'POST',
    token: managerEmployeeToken,
  });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.paymentStatus, 'paid');

  const customerInvoice = await api(`/orders/${orderId}/invoice`, {
    token: customerOneToken,
  });
  const adminInvoice = await api(`/admin/orders/${orderId}/invoice`, {
    token: employeeToken,
  });
  assert.equal(customerInvoice.status, 200, JSON.stringify(customerInvoice.body));
  assert.equal(adminInvoice.status, 200, JSON.stringify(adminInvoice.body));
  assert.equal(customerInvoice.body.status, 'issued');
  assert.equal(customerInvoice.body.totalAmount, '1000.00');
  assert.equal(adminInvoice.body.invoiceId, customerInvoice.body.invoiceId);
  assert.equal(adminInvoice.body.orderId, orderId);

  const managerInvoice = await api(`/admin/orders/${orderId}/invoice`, {
    token: managerEmployeeToken,
  });
  assert.equal(managerInvoice.status, 200, JSON.stringify(managerInvoice.body));
  assert.equal(managerInvoice.body.invoiceId, customerInvoice.body.invoiceId);

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

test('reloads current employee role from the database instead of JWT claims', async () => {
  const claims = JSON.parse(Buffer.from(employeeToken.split('.')[1], 'base64url').toString());
  assert.equal(Object.hasOwn(claims, 'role'), false);

  await updateEmployeeRole(employeeEmail, 'manager');
  try {
    const profile = await api('/auth/employee/profile', { token: employeeToken });
    assert.equal(profile.status, 200, JSON.stringify(profile.body));
    assert.equal(profile.body.role, 'manager');
  } finally {
    await updateEmployeeRole(employeeEmail, 'admin');
  }
});

test('employee role guard allows the two approved roles and denies legacy roles', () => {
  const guard = new EmployeeRolesGuard(new Reflector());
  const undecoratedController = class {};
  const undecoratedHandler = () => undefined;
  assert.equal(
    guard.canActivate(employeeRoleContext(undecoratedHandler, undecoratedController, 'admin')),
    false,
  );

  const controller = class {};
  const catalogHandler = () => undefined;
  EmployeeRoles('manager')(controller.prototype, 'catalog', {
    value: catalogHandler,
  });

  assert.equal(guard.canActivate(employeeRoleContext(catalogHandler, controller, 'manager')), true);
  assert.equal(guard.canActivate(employeeRoleContext(catalogHandler, controller, 'admin')), true);
  assert.equal(guard.canActivate(employeeRoleContext(catalogHandler, controller, 'catalog_manager')), false);
  assert.equal(guard.canActivate(employeeRoleContext(catalogHandler, controller, undefined)), false);
});

test('admin employee API lists and creates safe, normalized employee records', async () => {
  const list = await api('/admin/employees?page=1&limit=20', { token: employeeToken });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.deepEqual(Object.keys(list.body).sort(), ['items', 'limit', 'page', 'total']);
  assert.ok(list.body.items.length >= employeeRoles.length);
  assert.deepEqual(
    Object.keys(list.body.items[0]).sort(),
    ['email', 'employeeId', 'name', 'phone', 'position', 'role', 'status'],
  );
  assert.equal(JSON.stringify(list.body).includes('passwordHash'), false);

  const input = {
    name: 'Admin API Test Employee',
    email: `  Api-${randomUUID()}@Example.COM  `,
    password: 'Valid-Test-Password-2026!',
    phone: '0900000001',
    position: 'Catalog operator',
    role: 'manager',
  };
  const created = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: input,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.email, input.email.trim().toLowerCase());
  assert.equal(created.body.role, 'manager');
  assert.equal(created.body.status, 'active');
  assert.deepEqual(
    Object.keys(created.body).sort(),
    ['email', 'employeeId', 'name', 'phone', 'position', 'role', 'status'],
  );

  const duplicate = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: { ...input, email: input.email.toUpperCase() },
  });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));

  const invalidRole = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: { ...input, email: `invalid-role-${randomUUID()}@example.com`, role: 'owner' },
  });
  assert.equal(invalidRole.status, 400, JSON.stringify(invalidRole.body));

  const legacyRole = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: { ...input, email: `legacy-role-${randomUUID()}@example.com`, role: 'catalog_manager' },
  });
  assert.equal(legacyRole.status, 400, JSON.stringify(legacyRole.body));

  const invalidPassword = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: { ...input, email: `invalid-password-${randomUUID()}@example.com`, password: 'short' },
  });
  assert.equal(invalidPassword.status, 400, JSON.stringify(invalidPassword.body));

  const extraHash = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: {
      ...input,
      email: `forged-hash-${randomUUID()}@example.com`,
      passwordHash: 'client-controlled',
    },
  });
  assert.equal(extraHash.status, 400, JSON.stringify(extraHash.body));
});

test('only admins can list, create, or update employee access', async () => {
  const employeeId = await employeeIdForEmail(managerEmployeeEmail);
  const createBody = {
    name: 'Forbidden creation',
    email: `forbidden-${randomUUID()}@example.com`,
    password: 'Valid-Test-Password-2026!',
    position: 'Operator',
    role: 'manager',
  };

  for (const role of employeeRoles.filter((candidate) => candidate !== 'admin')) {
    const token = roleEmployeeTokens.get(role);
    assert.equal(
      (await api('/admin/employees', { token })).status,
      403,
      `${role} must not list employees`,
    );
    assert.equal(
      (await api('/admin/employees', { method: 'POST', token, body: createBody })).status,
      403,
      `${role} must not create employees`,
    );
    assert.equal(
      (await api(`/admin/employees/${employeeId}`, {
        method: 'PATCH',
        token,
        body: { role: 'manager' },
      })).status,
      403,
      `${role} must not update employee access`,
    );
  }

  assert.equal((await api('/admin/employees', { token: customerOneToken })).status, 401);
  assert.equal(
    (await api('/admin/employees', {
      method: 'POST',
      token: customerOneToken,
      body: createBody,
    })).status,
    401,
  );
  assert.equal(
    (await api(`/admin/employees/${employeeId}`, {
      method: 'PATCH',
      token: customerOneToken,
      body: { role: 'manager' },
    })).status,
    401,
  );
});

test('employee access changes apply to the same token and responses never expose password hashes', async () => {
  const createEmail = `live-role-${randomUUID()}@example.com`;
  const created = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: 'Live Role Test Employee',
      email: createEmail,
      password: 'Valid-Test-Password-2026!',
      position: 'Operator',
      role: 'manager',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const login = await api('/auth/employee/login', {
    method: 'POST',
    body: { email: createEmail, password: 'Valid-Test-Password-2026!' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const token = login.body.access_token;
  const employeeId = created.body.employeeId;
  assert.equal((await api('/categories', { token })).status, 200);

  const changed = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { role: 'admin' },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.role, 'admin');
  assert.equal(JSON.stringify(changed.body).includes('passwordHash'), false);
  assert.equal((await api('/auth/employee/profile', { token })).body.role, 'admin');
  assert.equal((await api('/categories', { token })).status, 200);
  assert.equal((await api('/promotions', { token })).status, 200);

  const invalidStatus = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { status: 'pending' },
  });
  assert.equal(invalidStatus.status, 400, JSON.stringify(invalidStatus.body));

  const invalidRole = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { role: 'owner' },
  });
  assert.equal(invalidRole.status, 400, JSON.stringify(invalidRole.body));

  const legacyRole = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { role: 'order_staff' },
  });
  assert.equal(legacyRole.status, 400, JSON.stringify(legacyRole.body));

  const nullRole = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { role: null },
  });
  assert.equal(nullRole.status, 400, JSON.stringify(nullRole.body));

  const nullStatus = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { status: null },
  });
  assert.equal(nullStatus.status, 400, JSON.stringify(nullStatus.body));

  const emptyPatch = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: {},
  });
  assert.equal(emptyPatch.status, 400, JSON.stringify(emptyPatch.body));

  const forgedHashPatch = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { passwordHash: 'client-controlled' },
  });
  assert.equal(forgedHashPatch.status, 400, JSON.stringify(forgedHashPatch.body));

  const updatedStatus = await api(`/admin/employees/${employeeId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { status: 'inactive' },
  });
  assert.equal(updatedStatus.status, 200, JSON.stringify(updatedStatus.body));
  assert.equal(updatedStatus.body.status, 'inactive');
  assert.equal((await api('/auth/employee/profile', { token })).status, 401);

  const list = await api('/admin/employees?page=1&limit=100', { token: employeeToken });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.equal(JSON.stringify(list.body).includes('passwordHash'), false);
  assert.equal(list.body.items.find((item) => item.employeeId === employeeId).status, 'inactive');
});

test('employee management pagination is bounded and an administrator cannot remove the last admin', async () => {
  const oversized = await api('/admin/employees?page=0&limit=101', { token: employeeToken });
  assert.equal(oversized.status, 400, JSON.stringify(oversized.body));

  const outOfRangeEmployeeId = await api('/admin/employees/2147483648', {
    method: 'PATCH',
    token: employeeToken,
    body: { role: 'manager' },
  });
  assert.equal(outOfRangeEmployeeId.status, 400, JSON.stringify(outOfRangeEmployeeId.body));

  const selfDemotion = await api(`/admin/employees/${await employeeIdForEmail(employeeEmail)}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { role: 'manager' },
  });
  assert.equal(selfDemotion.status, 409, JSON.stringify(selfDemotion.body));

  const selfDeactivation = await api(`/admin/employees/${await employeeIdForEmail(employeeEmail)}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { status: 'inactive' },
  });
  assert.equal(selfDeactivation.status, 409, JSON.stringify(selfDeactivation.body));
  assert.equal(await activeAdminCount(), 1);
});

test('concurrent administrators cannot demote each other and remove every active admin', async () => {
  const secondEmail = `second-admin-${randomUUID()}@example.com`;
  const secondCreated = await api('/admin/employees', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: 'Second Admin',
      email: secondEmail,
      password: 'Valid-Test-Password-2026!',
      position: 'Owner',
      role: 'admin',
    },
  });
  assert.equal(secondCreated.status, 201, JSON.stringify(secondCreated.body));
  const secondLogin = await api('/auth/employee/login', {
    method: 'POST',
    body: { email: secondEmail, password: 'Valid-Test-Password-2026!' },
  });
  assert.equal(secondLogin.status, 200, JSON.stringify(secondLogin.body));

  const firstAdminId = await employeeIdForEmail(employeeEmail);
  const secondAdminId = secondCreated.body.employeeId;
  const [firstUpdate, secondUpdate] = await Promise.all([
    api(`/admin/employees/${secondAdminId}`, {
      method: 'PATCH',
      token: employeeToken,
      body: { role: 'manager' },
    }),
    api(`/admin/employees/${firstAdminId}`, {
      method: 'PATCH',
      token: secondLogin.body.access_token,
      body: { role: 'manager' },
    }),
  ]);

  const results = [firstUpdate, secondUpdate];
  assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
  assert.ok(results.every((result) => [200, 403, 409].includes(result.status)), JSON.stringify(results));
  assert.equal(await activeAdminCount(), 1);
});

test('admin product image API creates, orders, replaces, preserves, clears, validates, and rolls back images', async () => {
  const categoryResponse = await api('/categories', { token: employeeToken });
  assert.equal(categoryResponse.status, 200, JSON.stringify(categoryResponse.body));
  const categoryId = categoryResponse.body[0].categoryId;

  const created = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Image test product ${randomUUID()}`,
      categoryId,
      images: [
        {
          imageUrl: ' https://images.example.com/back.jpg ',
          altText: ' Back view ',
          sortOrder: 5,
        },
        {
          imageUrl: 'https://images.example.com/front.jpg',
          altText: 'Front view',
          sortOrder: 5,
        },
        {
          imageUrl: 'https://images.example.com/detail.jpg',
          isPrimary: false,
        },
      ],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const createdImages = created.body.images;
  assert.deepEqual(
    createdImages.map(({ imageUrl, sortOrder }) => ({ imageUrl, sortOrder })),
    [
      { imageUrl: 'https://images.example.com/detail.jpg', sortOrder: 2 },
      { imageUrl: 'https://images.example.com/back.jpg', sortOrder: 5 },
      { imageUrl: 'https://images.example.com/front.jpg', sortOrder: 5 },
    ],
  );
  assert.deepEqual(createdImages.map(({ isPrimary }) => isPrimary), [true, false, false]);
  assert.equal(createdImages[1].altText, 'Back view');
  assert.equal(createdImages[0].altText, null);

  const detail = await api(`/products/${created.body.productId}`, { token: employeeToken });
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  assert.deepEqual(detail.body.images, createdImages);
  const list = await api('/products', { token: employeeToken });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const listedProduct = list.body.find(({ productId }) => productId === created.body.productId);
  assert.deepEqual(listedProduct.images, createdImages);

  const omitted = await api(`/products/${created.body.productId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { description: 'Metadata only update' },
  });
  assert.equal(omitted.status, 200, JSON.stringify(omitted.body));
  assert.deepEqual(omitted.body.images, createdImages, 'omitted images must be preserved');

  const replaced = await api(`/products/${created.body.productId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: {
      images: [
        { imageUrl: 'https://images.example.com/primary.jpg', sortOrder: 8, isPrimary: true },
        { imageUrl: 'https://images.example.com/secondary.jpg', sortOrder: 2 },
      ],
    },
  });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.deepEqual(
    replaced.body.images.map(({ imageUrl, sortOrder }) => ({ imageUrl, sortOrder })),
    [
      { imageUrl: 'https://images.example.com/secondary.jpg', sortOrder: 2 },
      { imageUrl: 'https://images.example.com/primary.jpg', sortOrder: 8 },
    ],
  );
  assert.deepEqual(replaced.body.images.map(({ isPrimary }) => isPrimary), [false, true]);

  const invalidPayloads = [
    {
      images: [
        { imageUrl: 'https://images.example.com/one.jpg', isPrimary: true },
        { imageUrl: 'https://images.example.com/two.jpg', isPrimary: true },
      ],
    },
    { images: [{ imageUrl: 'http://images.example.com/insecure.jpg' }] },
    { images: [{ imageUrl: 'not-a-url' }] },
    { images: [{ imageUrl: `https://images.example.com/${'a'.repeat(2050)}.jpg` }] },
    { images: [{ imageUrl: 'https://images.example.com/image.jpg', altText: 'x'.repeat(201) }] },
    { images: [{ imageUrl: 'https://images.example.com/image.jpg', sortOrder: -1 }] },
    { images: [{ imageUrl: 'https://images.example.com/image.jpg', sortOrder: 1.5 }] },
    {
      images: Array.from({ length: 13 }, (_, index) => ({
        imageUrl: `https://images.example.com/${index}.jpg`,
      })),
    },
    { images: null },
  ];
  for (const body of invalidPayloads) {
    const invalid = await api(`/products/${created.body.productId}`, {
      method: 'PATCH',
      token: employeeToken,
      body,
    });
    assert.equal(invalid.status, 400, JSON.stringify({ body, response: invalid.body }));
  }
  const afterInvalid = await api(`/products/${created.body.productId}`, { token: employeeToken });
  assert.deepEqual(afterInvalid.body.images, replaced.body.images, 'invalid requests must not mutate images');

  const cleared = await api(`/products/${created.body.productId}`, {
    method: 'PATCH',
    token: employeeToken,
    body: { images: [] },
  });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual(cleared.body.images, []);

  const emptyProduct = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: { name: `Empty image product ${randomUUID()}`, categoryId },
  });
  assert.equal(emptyProduct.status, 201, JSON.stringify(emptyProduct.body));
  assert.deepEqual(emptyProduct.body.images, []);

  const rollbackProduct = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Rollback image product ${randomUUID()}`,
      categoryId,
      images: [{ imageUrl: 'https://images.example.com/original.jpg', isPrimary: true }],
    },
  });
  assert.equal(rollbackProduct.status, 201, JSON.stringify(rollbackProduct.body));

  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION test_fail_product_image_insert() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.image_url LIKE '%force-rollback.example%' THEN
          RAISE EXCEPTION 'forced image insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await client.query(`
      CREATE TRIGGER test_fail_product_image_insert
      BEFORE INSERT ON product_image
      FOR EACH ROW EXECUTE FUNCTION test_fail_product_image_insert()
    `);

    const failedUpdate = await api(`/products/${rollbackProduct.body.productId}`, {
      method: 'PATCH',
      token: employeeToken,
      body: {
        name: 'Must roll back with image collection',
        images: [{ imageUrl: 'https://force-rollback.example/failure.jpg', isPrimary: true }],
      },
    });
    assert.equal(failedUpdate.status, 500, JSON.stringify(failedUpdate.body));
  } finally {
    await client.query('DROP TRIGGER IF EXISTS test_fail_product_image_insert ON product_image');
    await client.query('DROP FUNCTION IF EXISTS test_fail_product_image_insert()');
    await client.end();
  }

  const afterRollback = await api(`/products/${rollbackProduct.body.productId}`, { token: employeeToken });
  assert.equal(afterRollback.status, 200, JSON.stringify(afterRollback.body));
  assert.equal(afterRollback.body.name, rollbackProduct.body.name);
  assert.deepEqual(afterRollback.body.images, rollbackProduct.body.images);
});

test('storefront exposes primary image summaries and ordered detail images without leaking inactive products', async () => {
  const categoryResponse = await api('/categories', { token: employeeToken });
  assert.equal(categoryResponse.status, 200, JSON.stringify(categoryResponse.body));
  const categoryId = categoryResponse.body[0].categoryId;
  const suffix = randomUUID();
  const activeWithImages = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Store image active ${suffix}`,
      categoryId,
      status: 'active',
      images: [
        { imageUrl: 'https://images.example.com/store-detail.jpg', altText: 'Detail view', sortOrder: 9 },
        { imageUrl: 'https://images.example.com/store-primary.jpg', altText: 'Front view', sortOrder: 2, isPrimary: true },
        { imageUrl: 'https://images.example.com/store-back.jpg', altText: 'Back view', sortOrder: 5 },
      ],
    },
  });
  assert.equal(activeWithImages.status, 201, JSON.stringify(activeWithImages.body));

  const activeWithoutImages = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: { name: `Store image empty ${suffix}`, categoryId, status: 'active' },
  });
  assert.equal(activeWithoutImages.status, 201, JSON.stringify(activeWithoutImages.body));

  const inactiveWithImage = await api('/products', {
    method: 'POST',
    token: employeeToken,
    body: {
      name: `Store image inactive ${suffix}`,
      categoryId,
      status: 'inactive',
      images: [{ imageUrl: 'https://images.example.com/store-inactive-secret.jpg', altText: 'Hidden product' }],
    },
  });
  assert.equal(inactiveWithImage.status, 201, JSON.stringify(inactiveWithImage.body));

  const query = `categoryId=${categoryId}&q=${encodeURIComponent(suffix)}&limit=1`;
  const firstPage = await api(`/store/products?${query}&page=1`);
  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(firstPage.body.total, 2, 'total must count active matching products only');
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(firstPage.body.items[0].productId, activeWithImages.body.productId);
  assert.equal(firstPage.body.items[0].primaryImageUrl, 'https://images.example.com/store-primary.jpg');

  const secondPage = await api(`/store/products?${query}&page=2`);
  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.equal(secondPage.body.total, 2);
  assert.equal(secondPage.body.items.length, 1);
  assert.equal(secondPage.body.items[0].productId, activeWithoutImages.body.productId);
  assert.equal(secondPage.body.items[0].primaryImageUrl, null);

  const detail = await api(`/store/products/${activeWithImages.body.productId}`);
  assert.equal(detail.status, 200, JSON.stringify(detail.body));
  const imageIdsByUrl = new Map(
    activeWithImages.body.images.map(({ productImageId, imageUrl }) => [imageUrl, productImageId]),
  );
  assert.deepEqual(
    detail.body.images,
    [
      {
        productImageId: imageIdsByUrl.get('https://images.example.com/store-primary.jpg'),
        imageUrl: 'https://images.example.com/store-primary.jpg',
        altText: 'Front view',
        sortOrder: 2,
        isPrimary: true,
      },
      {
        productImageId: imageIdsByUrl.get('https://images.example.com/store-back.jpg'),
        imageUrl: 'https://images.example.com/store-back.jpg',
        altText: 'Back view',
        sortOrder: 5,
        isPrimary: false,
      },
      {
        productImageId: imageIdsByUrl.get('https://images.example.com/store-detail.jpg'),
        imageUrl: 'https://images.example.com/store-detail.jpg',
        altText: 'Detail view',
        sortOrder: 9,
        isPrimary: false,
      },
    ],
  );

  const inactiveDetail = await api(`/store/products/${inactiveWithImage.body.productId}`);
  assert.equal(inactiveDetail.status, 404);
  const inactiveSearch = await api(`/store/products?q=${encodeURIComponent(`Store image inactive ${suffix}`)}`);
  assert.equal(inactiveSearch.status, 200, JSON.stringify(inactiveSearch.body));
  assert.equal(inactiveSearch.body.total, 0);
  assert.deepEqual(inactiveSearch.body.items, []);
  assert.equal(
    JSON.stringify(inactiveDetail.body).includes('store-inactive-secret.jpg'),
    false,
    'inactive product image data must not appear in storefront responses',
  );
});
