import { Controller, Req } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { Public } from "../auth/decorators/public.decorator.js";
import { NotFoundError } from "../common/errors/app-exception.js";
import type { RequestWithHostTenant } from "./tenant-resolution.middleware.js";

/**
 * `GET /public/tenant-context` — pre-login branding for the login screen (M7 design D5). The
 * tenant was already resolved from the hostname by `TenantResolutionMiddleware`; an unknown host
 * is a 404. `@Public()` at the class level (M0 design D7).
 */
@Public()
@Controller()
export class TenantContextController {
  @TsRestHandler(contract.publicTenantContext)
  handler(@Req() req: RequestWithHostTenant) {
    return tsRestHandler(contract.publicTenantContext, async () => {
      const resolved = req.hostTenant;
      if (!resolved) throw new NotFoundError("No tenant serves this hostname");
      return {
        status: 200 as const,
        // Per-tenant branding arrives with tenant settings (m8); none is stored yet.
        body: { tenant_name: resolved.name, slug: resolved.slug, branding: null },
      };
    });
  }
}
