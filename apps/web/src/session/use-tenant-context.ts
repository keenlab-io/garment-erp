import { api } from "../api/client.js";

/** The login screen's view of the host-resolved tenant (M7 §14.1). */
export interface LoginTenant {
  name: string;
  slug: string;
  /** Optional logo from the tenant's branding blob (tenant settings land in m8; null until then). */
  logoUrl: string | null;
}

export const tenantContextKey = ["public", "tenant-context"] as const;

/** Only honour a logo URL that is plainly an http(s) or same-origin path — branding is free-form. */
function logoUrlFrom(branding: Record<string, unknown> | null): string | null {
  const url = branding?.logo_url;
  return typeof url === "string" && /^(https?:\/\/|\/)/.test(url) ? url : null;
}

/**
 * Resolves the tenant for the host this page was served from via `GET /public/tenant-context`
 * (M7 §14.1, design D5) so the login screen can show which factory the user is signing in to.
 * Pre-login and display-only: the tenant is never sent back to the api (login resolves it from
 * the host itself, and after login the token's `tid` claim is authoritative).
 *
 * Returns `null` while loading and on any failure — a host with no `tenant_domain` row answers 404,
 * and a self-hosted/dev api may not resolve one at all — so the screen falls back to the generic
 * login. No retries: a 404 is an answer, not a transient error.
 */
export function useTenantContext(): LoginTenant | null {
  const query = api.publicTenantContext.useQuery(tenantContextKey, undefined, {
    queryKey: tenantContextKey,
    retry: false,
    staleTime: Infinity,
  });
  if (query.data?.status !== 200) return null;
  const { tenant_name, slug, branding } = query.data.body;
  return { name: tenant_name, slug, logoUrl: logoUrlFrom(branding) };
}
