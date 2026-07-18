import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, MeResponse } from "@erp/contracts";
import { api } from "../api/client.js";
import { setTokens, clearTokens } from "../api/token-store.js";
import { useSession } from "./session-context.js";
import type { AuthUser } from "./dev-user.js";

function authUserFromMe(me: MeResponse): AuthUser {
  return {
    id: me.user.id,
    name: me.user.username,
    email: me.user.email,
    isSuperAdmin: me.user.is_super_admin,
    permissions: me.permissions,
  };
}

/**
 * Real login against the `iam` auth endpoint (MD1): exchanges credentials for a token pair, stores
 * it, fetches the authenticated identity, and commits it to the session context that feeds
 * `PermissionsProvider`. The `/login` screen (M1 §4.1) wires this to the credential form; failure
 * (bad credentials) rejects with the api error response for an inline message, without touching
 * the session.
 */
export function useLoginMutation() {
  const { signIn } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const loginResponse = await api.iam.login.mutation({ body: credentials });
      if (loginResponse.status !== 200) {
        throw loginResponse;
      }
      setTokens({
        accessToken: loginResponse.body.access_token,
        refreshToken: loginResponse.body.refresh_token,
      });

      const meResponse = await api.iam.me.query();
      if (meResponse.status !== 200) {
        clearTokens();
        throw meResponse;
      }
      return meResponse.body;
    },
    onSuccess: (me) => {
      // A fresh identity may reuse cached query results scoped to whoever was signed in before.
      queryClient.clear();
      signIn(authUserFromMe(me));
    },
  });
}
