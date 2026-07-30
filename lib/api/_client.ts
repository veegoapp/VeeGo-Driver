// Certificate pinning for all fetch() calls below is configured globally in
// lib/certificatePinning.ts (initialized from app/_layout.tsx) — it patches
// the native networking layer, so no changes are needed here. See
// docs/certificate-pinning.md.
import { getToken, getRefreshToken, saveToken, saveRefreshToken, deleteToken, deleteRefreshToken } from '../auth';

// ── Language / Accept-Language ─────────────────────────────────────────────────
// Updated by lib/i18nContext whenever the driver switches language.
// Injected into every outgoing request so the backend returns localized text.
let _acceptLanguage = 'en';

/**
 * Called by lib/i18nContext whenever the driver selects a different language.
 * Updates the module-level header value reactively so all subsequent API
 * requests carry the correct Accept-Language without requiring a provider re-mount.
 */
export function setApiLanguage(lang: string): void {
  _acceptLanguage = lang;
}

const _rawApiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!_rawApiUrl) {
  throw new Error(
    '[VeeGo Driver] EXPO_PUBLIC_API_URL is not set. ' +
    'Create a .env file in artifacts/veego-driver/ with:\n' +
    '  EXPO_PUBLIC_API_URL=https://<your-replit-domain>/api'
  );
}
export const API_BASE_URL: string = _rawApiUrl.startsWith('http') ? _rawApiUrl : `https://${_rawApiUrl}`;

export const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Global callback invoked when the server returns 403 account_suspended
type SuspendedCallback = () => void;
let _onAccountSuspended: SuspendedCallback | null = null;
export function setOnAccountSuspended(cb: SuspendedCallback) {
  _onAccountSuspended = cb;
}

// Global callback invoked when tokens are deleted after an unrecoverable 401.
// Registered by the auth guard in app/_layout.tsx to keep AuthContext state
// in sync with SecureStore when the API client clears the session.
type SessionClearedCallback = () => void;
let _onSessionCleared: SessionClearedCallback | null = null;
export function setOnSessionCleared(cb: SessionClearedCallback) {
  _onSessionCleared = cb;
}

// Single-flight refresh — only one refresh request may exist at a time.
//
// Return value distinguishes a genuine rejection from a transient failure:
//   string    — refreshed successfully, here's the new access token
//   null      — the refresh token itself was rejected (or none exists) —
//               the session is genuinely over, safe to log out
//   undefined — network error, timeout, or a server/5xx hiccup — we don't
//               know whether the refresh token is still good, so callers
//               must NOT log the user out over this (a server outage or
//               dropped connection used to force every session back to
//               the login screen the instant an access token expired)
let _refreshPromise: Promise<string | null | undefined> | null = null;

export async function refreshAccessToken(): Promise<string | null | undefined> {
  if (_refreshPromise) {
    return _refreshPromise;
  }

  _refreshPromise = (async (): Promise<string | null | undefined> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      return null;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        // 401/403 = the refresh token itself was rejected. Anything else
        // (5xx, 429, ...) is the server having a bad moment, not a verdict
        // on the token.
        return (response.status === 401 || response.status === 403) ? null : undefined;
      }
      const data = await response.json();
      if (data.accessToken) {
        await saveToken(data.accessToken);
        if (data.refreshToken) {
          await saveRefreshToken(data.refreshToken);
        }
        return data.accessToken;
      }
      return undefined;
    } catch {
      return undefined;
    }
  })();

  _refreshPromise.finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': _acceptLanguage,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // ── DEBUG: log vehicle catalog requests ──────────────────────────────────
  const isVehicleDebug = path.includes('/vehicles/');
  if (isVehicleDebug && __DEV__) {
    console.log('[API DEBUG]', method, `${API_BASE_URL}${path}`);
    console.log('[API DEBUG] Authorization:', token ? `Bearer ${token.slice(0, 20)}...` : 'MISSING — no token in storage');
  }
  // ─────────────────────────────────────────────────────────────────────────

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isVehicleDebug && __DEV__) console.log('[API DEBUG] Network error:', err);
    throw new ApiError(0, isAbort ? 'Request timed out' : 'Network error', null);
  }
  clearTimeout(timeout);

  // ── DEBUG: log response ───────────────────────────────────────────────────
  if (isVehicleDebug && __DEV__) {
    const cloned = response.clone();
    cloned.text().then(t => {
      console.log('[API DEBUG] Status:', response.status, response.statusText);
      console.log('[API DEBUG] Response body:', t.slice(0, 500));
    }).catch(() => {});
  }
  // ─────────────────────────────────────────────────────────────────────────

  // 401 → try silent refresh once
  if (response.status === 401 && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(method, path, body, true);
    }
    if (newToken === null) {
      // Refresh token itself was rejected (or none exists) — session is
      // genuinely over.
      await deleteToken();
      await deleteRefreshToken();
      _onSessionCleared?.();
    }
    // newToken === undefined: transient network/server failure while
    // refreshing — don't wipe the session over a dropped connection or a
    // server hiccup; the access token may still be good once it clears.
    throw new ApiError(401, 'Unauthorized', null);
  }

  if (response.status === 401 && isRetry) {
    await deleteToken();
    await deleteRefreshToken();
    _onSessionCleared?.();
    throw new ApiError(401, 'Unauthorized', null);
  }

  // Intercept 403 account_suspended — invoke global callback before throwing
  if (response.status === 403) {
    let errorBody: unknown = null;
    try { errorBody = await response.json(); } catch (e) {
      if (__DEV__) console.warn('[API] Could not parse 403 response body as JSON:', e);
    }
    const reason = (errorBody as { error?: string } | null)?.error;
    if (reason === 'account_suspended') {
      _onAccountSuspended?.();
    }
    throw new ApiError(403, 'Forbidden', errorBody);
  }

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(response.status, response.statusText, errorBody);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
