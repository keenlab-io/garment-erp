import { initQueryClient } from "@ts-rest/react-query";
import { tsRestFetchApi } from "@ts-rest/core";
import { contract } from "@erp/contracts";
import { clearPlatformTokens, getPlatformAccessToken } from "./platform-token-store.js";

const UNINTERCEPTED_PATHS = ["/platform/auth/login", "/platform/auth/refresh"];

/**
 * Typed client for the `platform` router, authenticated with the platform_admin token instead of the
 * tenant's (M8 §7.1) — a separate instance of the same contract, so the tenant `api` client never
 * carries a platform credential and vice versa. A 401 on any non-auth call clears the platform
 * session; the console shell watches the token store and routes back to the platform login.
 */
export const platformApi = initQueryClient(contract, {
  baseUrl: "",
  baseHeaders: {
    authorization: () => {
      const token = getPlatformAccessToken();
      return token ? `Bearer ${token}` : "";
    },
  },
  api: async (args) => {
    const response = await tsRestFetchApi(args);
    if (response.status === 401 && !UNINTERCEPTED_PATHS.some((path) => args.path.includes(path))) {
      clearPlatformTokens();
    }
    return response;
  },
});
