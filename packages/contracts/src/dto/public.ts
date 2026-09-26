import { z } from "zod";

/**
 * M7 — Tenancy Core: the public pre-login DTO (spec §1.4). `GET /public/tenant-context`
 * (defined directly on the root contract in `dto/index.ts`, not nested under a module
 * router) resolves the caller's tenant from the request hostname and returns just
 * enough to paint the login screen — never authenticated, never tenant data.
 */

export const TenantContextResponse = z.object({
  tenant_name: z.string(),
  slug: z.string(),
  branding: z.record(z.string(), z.unknown()).nullable(),
});
export type TenantContextResponse = z.infer<typeof TenantContextResponse>;
