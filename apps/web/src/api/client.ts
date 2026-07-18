import { initQueryClient } from "@ts-rest/react-query";
import { tsRestFetchApi } from "@ts-rest/core";
import { contract, ErrorCode, isErrorCode } from "@erp/contracts";
import { getAccessToken } from "./token-store.js";
import { notifyUnauthorized } from "./auth-events.js";

// login/refresh are public and answer 401 for bad credentials/an expired refresh token — that's a
// request failure, not "your session is dead", so the interceptor below never fires for them.
const UNINTERCEPTED_PATHS = ["/auth/login", "/auth/refresh"];

/**
 * Typed API client built from the SAME contract the api implements.
 * Change a field in @erp/contracts and this client (and its callers) fail to
 * compile — the core value of the monorepo (spec §5).
 */
export const api = initQueryClient(contract, {
  baseUrl: "",
  baseHeaders: {
    // Read on every request — a plain module-state token store, not React state (M1 §2.1).
    authorization: () => {
      const token = getAccessToken();
      return token ? `Bearer ${token}` : "";
    },
  },
  api: async (args) => {
    const response = await tsRestFetchApi(args);
    if (response.status === 401 && !UNINTERCEPTED_PATHS.some((path) => args.path.includes(path))) {
      const code = (response.body as { code?: unknown } | undefined)?.code;
      if (
        typeof code === "string" &&
        isErrorCode(code) &&
        (code === ErrorCode.UNAUTHENTICATED || code === ErrorCode.REAUTH_REQUIRED)
      ) {
        notifyUnauthorized(code);
      }
    }
    return response;
  },
});
