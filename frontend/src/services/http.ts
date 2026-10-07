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
  /** Prevent a request retried after refresh from starting another refresh. */
  skipAuthRefresh?: boolean;
  /** Preserve the session if the retried endpoint still returns 401. */
  authSessionUpdated?: boolean;
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
    public readonly authSessionUpdated = false,
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
  return tokenClaims(token)?.sub ?? null;
}

function tokenClaims(token: string): { sub: number; actorType?: string } | null {
  const payload = token.split('.')[1];
  if (!payload || typeof atob !== 'function') return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: unknown;
      actorType?: unknown;
    };
    const id = typeof claims.sub === 'string' ? Number(claims.sub) : claims.sub;
    if (!Number.isSafeInteger(id) || Number(id) <= 0) return null;
    return {
      sub: Number(id),
      actorType: typeof claims.actorType === 'string' ? claims.actorType : undefined,
    };
  } catch {
    return null;
  }
}

const localSessionQueues: Partial<Record<TokenOwner, Promise<void>>> = {};

/** Serialize login, logout, and refresh cookie changes for an actor session. */
export async function withAuthSessionLock<T>(
  owner: TokenOwner,
  operation: () => Promise<T>,
): Promise<T> {
  const runLocally = async (): Promise<T> => {
    const previous = localSessionQueues[owner] ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.catch(() => undefined).then(() => current);
    localSessionQueues[owner] = queued;
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (localSessionQueues[owner] === queued) delete localSessionQueues[owner];
    }
  };

  const lockManager = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return lockManager
    ? lockManager.request('indigo-auth-session-' + owner, runLocally)
    : runLocally();
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

interface ParsedResponse {
  response: Response;
  payload: unknown;
  responseText: string;
  invalidJson: boolean;
}

interface RefreshAttempt {
  token: string | null;
  invalid: boolean;
}

const refreshPromises: Partial<Record<TokenOwner, Promise<RefreshAttempt>>> = {};

function tokenStorageKeys(owner: TokenOwner): { token: string; profile: string } {
  return owner === 'customer'
    ? { token: 'customer_token', profile: 'customer_profile' }
    : { token: 'employee_token', profile: 'employee_profile' };
}

function clearLocalActorSession(owner: TokenOwner, expectedToken: string): void {
  if (tokenFor(owner) !== expectedToken) return;
  const keys = tokenStorageKeys(owner);
  window.localStorage.removeItem(keys.token);
  window.localStorage.removeItem(keys.profile);
  setActiveActorToken(owner, null);
  window.dispatchEvent(
    new CustomEvent('indigo:auth-unauthorized', { detail: { owner } }),
  );
}

async function parseResponse(response: Response): Promise<ParsedResponse> {
  const responseText = await response.text();
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
  return { response, payload, responseText, invalidJson };
}

function responseError(parsed: ParsedResponse): HttpError {
  return new HttpError(
    errorMessage(parsed.payload, parsed.response.status, parsed.response.statusText),
    parsed.response.status,
    parsed.payload,
  );
}

async function performFetch(
  url: URL,
  init: RequestInit,
  headers: Headers,
  body: unknown,
): Promise<ParsedResponse> {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: init.credentials ?? 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await parseResponse(response);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error('Unable to reach the server. Check your connection and try again.');
  }
}

async function refreshAccessToken(
  owner: TokenOwner,
  rejectedToken: string,
): Promise<RefreshAttempt> {
  const existing = refreshPromises[owner];
  if (existing) return existing;

  const performRotation = async (): Promise<RefreshAttempt> => {
    const currentToken = tokenFor(owner);
    if (!currentToken) return { token: null, invalid: true };
    if (currentToken !== rejectedToken) {
      return { token: currentToken, invalid: false };
    }

    let response: Response;
    try {
      response = await fetch('/auth/' + owner + '/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new HttpError(
        'Không thể làm mới phiên do mất kết nối. Hãy thử lại khi máy chủ hoạt động.',
        503,
      );
    }

    const parsed = await parseResponse(response);
    if (response.status === 401) return { token: null, invalid: true };
    if (!response.ok) throw responseError(parsed);
    if (parsed.invalidJson || typeof parsed.payload !== 'object' || parsed.payload === null) {
      throw new HttpError('Máy chủ trả dữ liệu làm mới phiên không hợp lệ.', 502, parsed.payload);
    }

    const accessToken = (parsed.payload as { access_token?: unknown }).access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new HttpError('Máy chủ không trả access token mới.', 502, parsed.payload);
    }
    const oldIdentity = tokenClaims(rejectedToken);
    const newIdentity = tokenClaims(accessToken);
    if (
      !oldIdentity ||
      !newIdentity ||
      oldIdentity.sub !== newIdentity.sub ||
      oldIdentity.actorType !== owner ||
      newIdentity.actorType !== owner
    ) {
      clearLocalActorSession(owner, rejectedToken);
      throw new HttpError(
        'The refreshed session belongs to a different account. Sign in again.',
        409,
      );
    }

    // A logout or account switch may have happened while the refresh request was in flight.
    if (tokenFor(owner) !== rejectedToken || activeActorTokens[owner] === null) {
      return { token: tokenFor(owner), invalid: false };
    }

    const keys = tokenStorageKeys(owner);
    window.localStorage.setItem(keys.token, accessToken);
    setActiveActorToken(owner, accessToken);
    return { token: accessToken, invalid: false };
  };

  const operation = withAuthSessionLock(owner, performRotation);
  refreshPromises[owner] = operation;
  try {
    return await operation;
  } finally {
    if (refreshPromises[owner] === operation) delete refreshPromises[owner];
  }
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

  const {
    body,
    tokenOwner,
    expectedPrincipalId,
    allowUnverifiedSession,
    skipAuthRefresh,
    authSessionUpdated,
    headers: providedHeaders,
    ...requestInit
  } = options;
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

  const parsed = await performFetch(requestUrl, requestInit, headers, body);
  if (!parsed.response.ok) {
    const initialError = responseError(parsed);
    if (parsed.response.status === 401 && tokenOwner && sentActorToken) {
      if (skipAuthRefresh && !authSessionUpdated) {
        clearLocalActorSession(tokenOwner, sentActorToken);
      } else if (skipAuthRefresh && authSessionUpdated) {
        throw new HttpError(
          initialError.message,
          initialError.status,
          initialError.payload,
          true,
        );
      } else {
        const latestToken = tokenFor(tokenOwner);
        if (latestToken && latestToken !== sentActorToken) {
          const oldIdentity = tokenClaims(sentActorToken);
          const newIdentity = tokenClaims(latestToken);
          if (
            !oldIdentity ||
            !newIdentity ||
            oldIdentity.sub !== newIdentity.sub ||
            oldIdentity.actorType !== tokenOwner ||
            newIdentity.actorType !== tokenOwner
          ) {
            throw new HttpError(
              'Your signed-in account changed. Sign in again before retrying this request.',
              409,
            );
          }
          return request<T>(path, {
            ...options,
            skipAuthRefresh: true,
            authSessionUpdated: true,
          });
        }

        const refreshed = await refreshAccessToken(tokenOwner, sentActorToken);
        if (refreshed.token) {
          const oldIdentity = tokenClaims(sentActorToken);
          const newIdentity = tokenClaims(refreshed.token);
          if (
            !oldIdentity ||
            !newIdentity ||
            oldIdentity.sub !== newIdentity.sub ||
            oldIdentity.actorType !== tokenOwner ||
            newIdentity.actorType !== tokenOwner
          ) {
            throw new HttpError(
              'The refreshed session belongs to a different account. Sign in again.',
              409,
            );
          }
          return request<T>(path, {
            ...options,
            skipAuthRefresh: true,
            authSessionUpdated: true,
          });
        }
        if (refreshed.invalid) {
          clearLocalActorSession(tokenOwner, sentActorToken);
        }
      }
    }
    throw initialError;
  }

  if (parsed.response.status === 204 || !parsed.responseText.trim()) return undefined as T;
  if (parsed.invalidJson) {
    throw new HttpError(
      'The server returned an invalid JSON response.',
      parsed.response.status,
      parsed.payload,
    );
  }
  return parsed.payload as T;
}
