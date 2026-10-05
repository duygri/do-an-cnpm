export type TokenOwner = 'customer' | 'employee';

export interface JsonRequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON value serialized into the request body. */
  body?: unknown;
  /** Add the token stored for this actor, when present. */
  tokenOwner?: TokenOwner;
  /** Refuse the request if the stored profile/token belongs to another actor. */
  expectedPrincipalId?: number;
  /** Permit the profile refresh that validates a changed or restored session. */
  allowUnverifiedSession?: boolean;
}

const activeActorTokens: Record<TokenOwner, string | null | undefined> = {
  customer: undefined,
  employee: undefined,
};

/** Pin requests in this tab to the actor session currently held by AuthProvider. */
export function setActiveActorToken(owner: TokenOwner, token: string | null | undefined): void {
  activeActorTokens[owner] = token;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function tokenFor(owner: TokenOwner): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(
    owner === 'customer' ? 'customer_token' : 'employee_token',
  );
}

function storedPrincipalId(owner: TokenOwner): number | null {
  if (typeof window === 'undefined') return null;
  const key = owner === 'customer' ? 'customer_profile' : 'employee_profile';
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const profile = JSON.parse(value) as { customerId?: unknown; employeeId?: unknown };
    const id = owner === 'customer' ? profile.customerId : profile.employeeId;
    return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null;
  } catch {
    return null;
  }
}

function tokenPrincipalId(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload || typeof atob !== 'function') return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown };
    const id = typeof claims.sub === 'string' ? Number(claims.sub) : claims.sub;
    return Number.isSafeInteger(id) && Number(id) > 0 ? Number(id) : null;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function errorMessage(payload: unknown, status: number, statusText: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();

  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    if (Array.isArray(message)) {
      const messages = message.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      );
      if (messages.length > 0) return messages.join(' · ');
    }
  }

  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }

  return statusText || `Request failed with status ${status}.`;
}

/**
 * Send same-origin JSON requests and parse NestJS error payloads consistently.
 * API paths must be rooted paths such as `/store/products`.
 */
export async function request<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const origin = typeof window === 'undefined' ? undefined : window.location.origin;
  if (!origin) {
    throw new TypeError('API requests require a browser origin.');
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(path, origin);
  } catch {
    throw new TypeError('API requests must use a same-origin rooted path.');
  }

  // URL parsing treats backslashes as separators for special schemes, so check
  // the resolved origin and reject backslashes before touching auth storage.
  if (requestUrl.origin !== origin) {
    throw new TypeError('API requests must use a same-origin rooted path.');
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new TypeError('API requests must use a same-origin rooted path.');
  }

  const { body, tokenOwner, expectedPrincipalId, allowUnverifiedSession, headers: providedHeaders, ...requestInit } = options;
  const headers = new Headers(providedHeaders);
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let sentActorToken: string | null = null;
  if (tokenOwner) {
    const storedToken = tokenFor(tokenOwner);
    const activeToken = activeActorTokens[tokenOwner];
    if (!allowUnverifiedSession && (
      activeToken === null
      || (activeToken !== undefined && activeToken !== storedToken)
    )) {
      throw new HttpError(
        'Your signed-in account changed. Wait for the session to refresh before trying again.',
        409,
      );
    }
    const token = allowUnverifiedSession ? storedToken : activeToken ?? storedToken;
    if (expectedPrincipalId !== undefined && (
      !token
      || storedPrincipalId(tokenOwner) !== expectedPrincipalId
      || tokenPrincipalId(token) !== expectedPrincipalId
    )) {
      throw new HttpError(
        'Your signed-in account changed. Refresh the page and confirm the account before retrying.',
        409,
      );
    }
    if (token) {
      sentActorToken = token;
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response: Response;
  let responseText: string;
  try {
    response = await fetch(requestUrl, {
      ...requestInit,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    responseText = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error('Unable to reach the server. Check your connection and try again.');
  }

  let payload: unknown;
  let invalidJson = false;
  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = responseText;
      invalidJson = true;
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      tokenOwner &&
      sentActorToken &&
      tokenFor(tokenOwner) === sentActorToken
    ) {
      const tokenKey = tokenOwner === 'customer' ? 'customer_token' : 'employee_token';
      const profileKey = tokenOwner === 'customer' ? 'customer_profile' : 'employee_profile';
      window.localStorage.removeItem(tokenKey);
      window.localStorage.removeItem(profileKey);
      window.dispatchEvent(
        new CustomEvent('indigo:auth-unauthorized', { detail: { owner: tokenOwner } }),
      );
    }
    throw new HttpError(
      errorMessage(payload, response.status, response.statusText),
      response.status,
      payload,
    );
  }

  if (response.status === 204 || !responseText.trim()) return undefined as T;
  if (invalidJson) {
    throw new HttpError('The server returned an invalid JSON response.', response.status, payload);
  }
  return payload as T;
}
