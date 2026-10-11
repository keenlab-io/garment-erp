import { platformApi } from "./platform-client.js";
import {
  clearPlatformTokens,
  getPlatformAccessToken,
  getPlatformRefreshToken,
  setPlatformTokens,
} from "./platform-token-store.js";

/**
 * Makes sure a platform_admin session is usable, for route guards: an in-memory access token wins;
 * otherwise the tab-persisted refresh token is exchanged (rotating it). Returns false — and clears
 * any stale token — when there is nothing valid, so the guard sends the visitor to the login.
 */
export async function ensurePlatformSession(): Promise<boolean> {
  if (getPlatformAccessToken()) return true;
  const refreshToken = getPlatformRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await platformApi.platform.refresh.mutation({ body: { refresh_token: refreshToken } });
    if (response.status !== 200) {
      clearPlatformTokens();
      return false;
    }
    setPlatformTokens({
      accessToken: response.body.access_token,
      refreshToken: response.body.refresh_token,
    });
    return true;
  } catch {
    clearPlatformTokens();
    return false;
  }
}
