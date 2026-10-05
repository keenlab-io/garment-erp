import { Controller, Req, UseGuards } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import { contract } from "@erp/contracts";
import { Public } from "../auth/decorators/public.decorator.js";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { PlatformAuditService } from "./platform-audit.service.js";
import { PlatformAuthService, type PlatformPrincipal } from "./platform-auth.service.js";
import { PlatformJwtGuard, type PlatformRequest } from "./platform-jwt.guard.js";
import { SupportSessionService } from "./support-session.service.js";
import { TenantDataService } from "./tenant-data.service.js";
import { TenantProvisioningService } from "./tenant-provisioning.service.js";

/**
 * `POST /platform/auth/login|refresh` — unauthenticated by definition (refresh carries its own
 * token in the body), so they live apart from the guarded surface (same split as `IamAuthController`). `@Public()` at the class level: the
 * tenant `JwtGuard` cannot read method-level metadata on ts-rest handlers (M0 design D7).
 */
@Public()
@Controller()
export class PlatformAuthController {
  constructor(private readonly auth: PlatformAuthService) {}

  @TsRestHandler(contract.platform.login)
  login() {
    return tsRestHandler(contract.platform.login, async ({ body }) => ({
      status: 200,
      body: await this.auth.login(body.email, body.password),
    }));
  }

  @TsRestHandler(contract.platform.refresh)
  refresh() {
    return tsRestHandler(contract.platform.refresh, async ({ body }) => ({
      status: 200,
      body: await this.auth.refresh(body.refresh_token),
    }));
  }
}

/**
 * The control-plane surface for `contract.platform` (M7 design D6): the platform admin's own
 * session (`me`/`logout`), tenant provisioning and lifecycle, PDPA export + purge (M8 design D9),
 * support sessions, and the platform audit log. `@Public()` opts out of the tenant
 * `JwtGuard` (a platform token carries no `tid`); `PlatformJwtGuard` authenticates the platform
 * admin instead, and refuses every tenant token. Registered only in `DEPLOYMENT_MODE=cloud`.
 */
@Public()
@UseGuards(PlatformJwtGuard)
@Controller()
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly tenants: TenantProvisioningService,
    private readonly supportSessions: SupportSessionService,
    private readonly audit: PlatformAuditService,
    private readonly tenantData: TenantDataService,
  ) {}

  @TsRestHandler(contract.platform.me)
  me(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.me, async () => ({
      status: 200,
      body: this.auth.me(admin(req)),
    }));
  }

  @TsRestHandler(contract.platform.logout)
  logout(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.logout, async () => {
      await this.auth.logout(admin(req));
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.platform.listTenants)
  listTenants() {
    return tsRestHandler(contract.platform.listTenants, async ({ query }) => ({
      status: 200,
      body: await this.tenants.list({
        limit: query.limit,
        cursor: query.cursor,
        status: query["filter[status]"],
        kind: query["filter[kind]"],
      }),
    }));
  }

  @TsRestHandler(contract.platform.createTenant)
  createTenant(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.createTenant, async ({ body }) => ({
      status: 201,
      body: await this.tenants.provisionTenant(body, admin(req).id),
    }));
  }

  @TsRestHandler(contract.platform.setTenantStatus)
  setTenantStatus(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.setTenantStatus, async ({ params, body }) => ({
      status: 200,
      body: { tenant: await this.tenants.setStatus(params.id, body, admin(req).id) },
    }));
  }

  @TsRestHandler(contract.platform.purgeTenant)
  purgeTenant(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.purgeTenant, async ({ params, body }) => ({
      status: 202,
      body: await this.tenantData.requestPurge(params.id, body.confirm, admin(req).id),
    }));
  }

  @TsRestHandler(contract.platform.exportTenant)
  exportTenant(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.exportTenant, async ({ params }) => ({
      status: 202,
      body: await this.tenantData.requestExport(params.id, { platformAdminId: admin(req).id }),
    }));
  }

  @TsRestHandler(contract.platform.getTenantExport)
  getTenantExport() {
    return tsRestHandler(contract.platform.getTenantExport, async ({ params }) => ({
      status: 200,
      body: await this.tenantData.exportStatus(params.id, params.job_id),
    }));
  }

  @TsRestHandler(contract.platform.createSupportSession)
  createSupportSession(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.createSupportSession, async ({ body }) => ({
      status: 201,
      body: await this.supportSessions.create(body, admin(req).id),
    }));
  }

  @TsRestHandler(contract.platform.revokeSupportSession)
  revokeSupportSession(@Req() req: PlatformRequest) {
    return tsRestHandler(contract.platform.revokeSupportSession, async ({ params }) => {
      await this.supportSessions.revoke(params.id, admin(req).id);
      return { status: 204, body: undefined };
    });
  }

  @TsRestHandler(contract.platform.listAudit)
  listAudit() {
    return tsRestHandler(contract.platform.listAudit, async ({ query }) => ({
      status: 200,
      body: await this.audit.list(query),
    }));
  }
}

/** The admin `PlatformJwtGuard` attached — always present behind the guard. */
function admin(req: PlatformRequest): PlatformPrincipal {
  if (!req.platformAdmin) throw new UnauthenticatedError();
  return req.platformAdmin;
}
