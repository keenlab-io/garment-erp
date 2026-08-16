import { api } from "../api/client.js";
import { clearTokens, getRefreshToken, setTokens } from "../api/token-store.js";
import type { AuthUser } from "./dev-user.js";
import { authUserFromMe } from "./auth-user-from-me.js";

/**
 * Re-establishes the session on a fresh page load. The access token is memory-only and gone after a
 * reload, but the refresh token was persisted (`token-store`), so we exchange it for a fresh pair
 * (`POST /auth/refresh`, which rotates the refresh token) and re-fetch the identity (`GET /auth/me`).
 *
 * Returns the restored `AuthUser`, or `null` when there is nothing to restore or the persisted token
 * is no longer valid — in which case any stale token is cleared and the shell boots logged-out. This
 * runs before the app renders so route guards see the resolved session synchronously and a valid
 * session never flashes `/login`.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const refreshResponse = await api.iam.refresh.mutation({ body: { refresh_token: refreshToken } });
    if (refreshResponse.status !== 200) {
      clearTokens();
      return null;
    }
    setTokens({
      accessToken: refreshResponse.body.access_token,
      refreshToken: refreshResponse.body.refresh_token,
    });

    const meResponse = await api.iam.me.query();
    if (meResponse.status !== 200) {
      clearTokens();
      return null;
    }
    return authUserFromMe(meResponse.body);
  } catch {
    // Network failure or unexpected error — don't wedge the app on a broken token; boot logged-out.
    clearTokens();
    return null;
  }
}
