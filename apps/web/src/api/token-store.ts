/**
 * Holds the current access/refresh token pair. The **access** token lives in memory only (M1 design
 * "Risks/Trade-offs": keep it out of `localStorage` where possible) — the api client's `baseHeaders`
 * reads `getAccessToken()` synchronously on every request, outside any component tree. The
 * **refresh** token is additionally persisted to `localStorage` so a full page reload can silently
 * re-establish the session (`restoreSession`) instead of bouncing to `/login`.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** The single `localStorage` key holding the persisted refresh token (survives a page reload). */
export const REFRESH_TOKEN_STORAGE_KEY = "erp.refresh_token";

let current: TokenPair | null = null;

/** Best-effort write; `localStorage` can throw (private mode, disabled storage) — degrade to
 *  memory-only rather than breaking auth. */
function persistRefreshToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // Storage unavailable — the in-memory `current` still carries the session for this page life.
  }
}

export function getAccessToken(): string | null {
  return current?.accessToken ?? null;
}

/**
 * The active refresh token. Falls back to the persisted copy when memory is empty — the case right
 * after a page reload, before `restoreSession` has re-seeded `current`.
 */
export function getRefreshToken(): string | null {
  if (current) return current.refreshToken;
  try {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setTokens(tokens: TokenPair): void {
  current = tokens;
  persistRefreshToken(tokens.refreshToken);
}

export function clearTokens(): void {
  current = null;
  persistRefreshToken(null);
}
