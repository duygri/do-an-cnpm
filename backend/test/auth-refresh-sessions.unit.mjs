import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { Customer } from '../dist/customers/entities/customer.entity.js';
import { Employee } from '../dist/employees/entities/employee.entity.js';
import {
  clearRefreshCookie,
  setRefreshCookie,
} from '../dist/auth/auth-cookie.js';
import { ACCESS_TOKEN_LIFETIME_SECONDS } from '../dist/auth/auth-token.constants.js';
import { AuthRefreshToken } from '../dist/auth/entities/auth-refresh-token.entity.js';
import { RefreshSessionsService } from '../dist/auth/refresh-sessions.service.js';

const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function makeRefreshRow(overrides = {}) {
  const now = new Date();
  return {
    id: randomUUID(),
    familyId: randomUUID(),
    customerId: 42,
    employeeId: null,
    tokenHash: hash('initial-refresh-token'),
    createdAt: now,
    expiresAt: new Date(now.getTime() + refreshLifetimeMs),
    consumedAt: null,
    revokedAt: null,
    replacedByTokenId: null,
    ...overrides,
  };
}

function hash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createHarness(seed = []) {
  const rows = [...seed];
  let tokenSequence = 0;
  const repository = {
    create: (value) => ({ ...value }),
    save: async (row) => {
      const existingIndex = rows.findIndex(({ id }) => id === row.id);
      if (existingIndex === -1) rows.push(row);
      else rows[existingIndex] = row;
      return row;
    },
    findOne: async ({ where }) => rows.find(({ tokenHash }) => tokenHash === where.tokenHash) ?? null,
    update: async (where, changes) => {
      let affected = 0;
      for (const row of rows) {
        if (row.familyId === where.familyId) {
          Object.assign(row, changes);
          affected += 1;
        }
      }
      return { affected };
    },
  };

  let transactionActive = false;
  const queryRunner = {
    manager: {
      getRepository: (entity) => {
        assert.equal(entity, AuthRefreshToken);
        return repository;
      },
      findOneBy: async (entity, criteria) => {
        if (entity === Customer) return { customerId: criteria.customerId };
        if (entity === Employee) return { employeeId: criteria.employeeId, status: 'active' };
        throw new Error(`Unexpected entity lookup: ${entity?.name}`);
      },
    },
    connect: async () => {},
    startTransaction: async () => { transactionActive = true; },
    commitTransaction: async () => { transactionActive = false; },
    rollbackTransaction: async () => { transactionActive = false; },
    release: async () => {},
    get isTransactionActive() { return transactionActive; },
  };
  const jwt = {
    signAsync: async () => `access-token-${++tokenSequence}`,
  };
  const dataSource = { createQueryRunner: () => queryRunner };
  const service = new RefreshSessionsService(repository, {}, {}, dataSource, jwt);
  return { service, rows };
}

function config(values = {}) {
  const settings = {
    NODE_ENV: 'test',
    ...values,
  };
  return { get: (key) => settings[key] };
}

test('creates customer refresh sessions with a seven-day lifetime and stores only a hash', async () => {
  const { service, rows } = createHarness();
  const session = await service.createSession('customer', 42);

  assert.equal(typeof session.accessToken, 'string');
  assert.equal(typeof session.refreshToken, 'string');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerId, 42);
  assert.equal(rows[0].employeeId, null);
  assert.equal(rows[0].tokenHash, hash(session.refreshToken));
  assert.notEqual(rows[0].tokenHash, session.refreshToken);
  assert.equal(rows[0].expiresAt.getTime() - rows[0].createdAt.getTime(), refreshLifetimeMs);
});
test('rotates a customer refresh token and returns a short-lived access token', async () => {
  const oldToken = 'customer-refresh-before-rotation';
  const original = makeRefreshRow({ tokenHash: hash(oldToken) });
  const { service, rows } = createHarness([original]);

  const rotated = await service.rotate('customer', oldToken);

  assert.equal(rotated.response.token_type, 'Bearer');
  assert.equal(rotated.response.expires_in, ACCESS_TOKEN_LIFETIME_SECONDS);
  assert.equal(typeof rotated.response.access_token, 'string');
  assert.notEqual(rotated.tokens.refreshToken, oldToken);
  assert.equal(rows.length, 2);
  assert.ok(original.consumedAt instanceof Date);
  assert.equal(original.replacedByTokenId, rows[1].id);
  assert.equal(rows[1].familyId, original.familyId);
  assert.equal(rows[1].tokenHash, hash(rotated.tokens.refreshToken));
  assert.equal(rows[1].consumedAt, null);
  assert.equal(rows[1].revokedAt, null);
});

test('reusing a consumed customer token revokes every token in its family', async () => {
  const oldToken = 'customer-refresh-already-used';
  const familyId = randomUUID();
  const consumed = makeRefreshRow({
    familyId,
    tokenHash: hash(oldToken),
    consumedAt: new Date(Date.now() - 1_000),
  });
  const current = makeRefreshRow({ familyId, tokenHash: hash('current-refresh-token') });
  const { service, rows } = createHarness([consumed, current]);

  await assert.rejects(service.rotate('customer', oldToken), UnauthorizedException);
  assert.ok(rows.every(({ revokedAt }) => revokedAt instanceof Date));
});

test('rejects an expired customer token and revokes its family', async () => {
  const expiredToken = 'customer-refresh-expired';
  const row = makeRefreshRow({
    tokenHash: hash(expiredToken),
    expiresAt: new Date(Date.now() - 1_000),
  });
  const { service, rows } = createHarness([row]);

  await assert.rejects(service.rotate('customer', expiredToken), UnauthorizedException);
  assert.ok(rows[0].revokedAt instanceof Date);
});

test('logout revokes the customer refresh-token family', async () => {
  const currentToken = 'customer-refresh-before-logout';
  const row = makeRefreshRow({ tokenHash: hash(currentToken) });
  const { service, rows } = createHarness([row]);

  await service.revokeCurrentFamily('customer', currentToken);
  assert.ok(rows[0].revokedAt instanceof Date);
});

test('refresh cookies are HttpOnly, SameSite=Lax, actor-scoped, and cleared on logout', () => {
  const calls = [];
  const response = {
    cookie: (...args) => calls.push(['cookie', ...args]),
    clearCookie: (...args) => calls.push(['clearCookie', ...args]),
  };
  const productionConfig = config({ NODE_ENV: 'production' });

  setRefreshCookie(response, productionConfig, 'customer', 'opaque-refresh-token');
  assert.deepEqual(calls[0], [
    'cookie',
    'customer_refresh_token',
    'opaque-refresh-token',
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/auth/customer',
      maxAge: refreshLifetimeMs,
    },
  ]);

  clearRefreshCookie(response, productionConfig, 'customer');
  assert.deepEqual(calls[1], [
    'clearCookie',
    'customer_refresh_token',
    { httpOnly: true, sameSite: 'lax', secure: true, path: '/auth/customer' },
  ]);
});
