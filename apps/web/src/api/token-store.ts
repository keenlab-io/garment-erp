/**
 * Holds the current access/refresh token pair in memory only (M1 design "Risks/Trade-offs": keep
 * the access token out of `localStorage` where possible). Plain module state, not React state — the
 * api client's `baseHeaders` reads `getAccessToken()` synchronously on every request, outside any
 * component tree.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let current: TokenPair | null = null;

export function getAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return current?.refreshToken ?? null;
}

export function setTokens(tokens: TokenPair): void {
  current = tokens;
}

export function clearTokens(): void {
  current = null;
}
