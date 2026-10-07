import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

export type AuthActor = 'customer' | 'employee';

const COOKIE_PATHS: Record<AuthActor, string> = {
  customer: '/auth/customer',
  employee: '/auth/employee',
};

export function refreshCookieName(actor: AuthActor): string {
  return actor === 'customer'
    ? 'customer_refresh_token'
    : 'employee_refresh_token';
}

export function readRefreshCookie(
  request: Request,
  actor: AuthActor,
): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  const prefix = `${refreshCookieName(actor)}=`;
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return pair ? pair.slice(prefix.length) || null : null;
}

function cookieOptions(config: ConfigService) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.get<string>('NODE_ENV') === 'production',
  };
}

export function setRefreshCookie(
  response: Response,
  config: ConfigService,
  actor: AuthActor,
  refreshToken: string,
): void {
  response.cookie(refreshCookieName(actor), refreshToken, {
    ...cookieOptions(config),
    path: COOKIE_PATHS[actor],
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(
  response: Response,
  config: ConfigService,
  actor: AuthActor,
): void {
  response.clearCookie(refreshCookieName(actor), {
    ...cookieOptions(config),
    path: COOKIE_PATHS[actor],
  });
}

export function getAllowedAuthOrigins(config: ConfigService): string[] {
  const configuredOrigins = config.get<string>('AUTH_ALLOWED_ORIGINS');
  const allowedOrigins =
    configuredOrigins === undefined
      ? [
          'http://localhost:5173',
          'http://localhost:5175',
          'http://127.0.0.1:5173',
          'http://127.0.0.1:5175',
        ]
      : configuredOrigins
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

  if (
    config.get<string>('NODE_ENV') === 'production' &&
    (configuredOrigins === undefined || allowedOrigins.length === 0)
  ) {
    throw new InternalServerErrorException(
      'AUTH_ALLOWED_ORIGINS must be configured in production.',
    );
  }

  return allowedOrigins;
}

export function assertAllowedSameSiteRequest(
  request: Request,
  config: ConfigService,
): void {
  const origin = request.get('origin');
  const allowedOrigins = getAllowedAuthOrigins(config);

  if (!origin || !allowedOrigins.includes(origin)) {
    throw new ForbiddenException(
      'Origin is not allowed for auth session actions.',
    );
  }

  const fetchSite = request.get('sec-fetch-site');
  if (
    fetchSite !== undefined &&
    fetchSite !== 'same-origin' &&
    fetchSite !== 'same-site'
  ) {
    throw new ForbiddenException('Auth session actions must be same-site.');
  }
}
