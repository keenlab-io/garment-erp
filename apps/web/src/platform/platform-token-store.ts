/**
 * The platform_admin token pair (M8 §7.1). Deliberately separate from the tenant `token-store`: a
 * platform principal and a tenant user never share credentials (design D7), and the two sessions
 * can coexist in one browser. The access token is memory-only; the refresh token is kept in
 * `sessionStorage` (tab-scoped, unlike the tenant's `localStorage`) so a reload re-establishes the
 * console session without leaving a long-lived staff credential on disk.
 */
export interface PlatformTokenPair {
  accessToken: string;
  refreshToken: string;
}

export const PLATFORM_REFRESH_TOKEN_STORAGE_KEY = "erp.platform_refresh_token";

type Listener = () => void;

let current: PlatformTokenPair | null = null;
let version = 0;
const listeners = new Set<Listener>();

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function persist(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(PLATFORM_REFRESH_TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(PLATFORM_REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // Storage unavailable — the in-memory pair still carries the session for this page life.
  }
}

export function getPlatformAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function getPlatformRefreshToken(): string | null {
  if (current) return current.refreshToken;
  try {
    return sessionStorage.getItem(PLATFORM_REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setPlatformTokens(tokens: PlatformTokenPair): void {
  current = tokens;
  persist(tokens.refreshToken);
  emit();
}

export function clearPlatformTokens(): void {
  const had = current !== null || getPlatformRefreshToken() !== null;
  current = null;
  persist(null);
  if (had) emit();
}

/** `useSyncExternalStore` plumbing: a token-change counter as the snapshot. */
export function subscribePlatformTokens(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlatformTokensVersion(): number {
  return version;
}
