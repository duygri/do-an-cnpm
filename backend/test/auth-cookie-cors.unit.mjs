import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { assertAllowedSameSiteRequest } from '../dist/auth/auth-cookie.js';

function config(values = {}) {
  const settings = {
    AUTH_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5175',
    NODE_ENV: 'test',
    ...values,
  };
  return { get: (key) => settings[key] };
}

function request(headers) {
  return { get: (name) => headers[name.toLowerCase()] };
}

test('same-site auth actions accept configured origins and reject foreign or cross-site requests', () => {
  const allowedConfig = config();
  assert.doesNotThrow(() =>
    assertAllowedSameSiteRequest(
      request({ origin: 'http://localhost:5173', 'sec-fetch-site': 'same-site' }),
      allowedConfig,
    ),
  );
  assert.throws(
    () =>
      assertAllowedSameSiteRequest(
        request({ origin: 'https://attacker.example' }),
        allowedConfig,
      ),
    ForbiddenException,
  );
  assert.throws(
    () =>
      assertAllowedSameSiteRequest(
        request({ origin: 'http://localhost:5173', 'sec-fetch-site': 'cross-site' }),
        allowedConfig,
      ),
    ForbiddenException,
  );
});

test('production auth actions require an explicit allowed-origin list', () => {
  assert.throws(
    () =>
      assertAllowedSameSiteRequest(
        request({ origin: 'https://shop.example' }),
        config({ AUTH_ALLOWED_ORIGINS: undefined, NODE_ENV: 'production' }),
      ),
    /AUTH_ALLOWED_ORIGINS must be configured in production/,
  );
});
