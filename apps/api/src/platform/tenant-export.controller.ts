import { Controller } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { ForbiddenError } from "../common/errors/app-exception.js";
import { TenantDataService } from "./tenant-data.service.js";

/** PDPA portability is the data owner's call: only the tenant's own super-admin may export. */
function assertTenantSuperAdmin(user: AuthUser): void {
  if (!user.isSuperAdmin) {
    throw new ForbiddenError("Only a tenant super-admin can export the tenant's data");
  }
}

/**
 * The tenant-side half of the PDPA export (M8 design D9): the tenant super-admin triggers
 * `tenant.export` for their own tenant (the token's `tid` — never a request argument) and polls
 * it. `POST /iam/tenant-export` is on `TenantStatusGuard`'s READ_ONLY allowlist (design D6), so
 * portability never depends on being paid up. Mounted in both deployment modes.
 */
@Controller()
export class TenantExportController {
  constructor(private readonly data: TenantDataService) {}

  @TsRestHandler(contract.iam.exportTenantData)
  exportTenantData(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.exportTenantData, async () => {
      assertTenantSuperAdmin(user);
      return {
        status: 202,
        body: await this.data.requestExport(user.tenantId, { userId: user.id }),
      };
    });
  }

  @TsRestHandler(contract.iam.getTenantDataExport)
  getTenantDataExport(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.iam.getTenantDataExport, async ({ params }) => {
      assertTenantSuperAdmin(user);
      return { status: 200, body: await this.data.exportStatus(user.tenantId, params.job_id) };
    });
  }
}
