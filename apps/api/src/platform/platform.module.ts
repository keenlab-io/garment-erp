import { type DynamicModule, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { workersEnabled } from "../config/app-role.js";
import { PlatformAuditService } from "./platform-audit.service.js";
import { PlatformAuthService } from "./platform-auth.service.js";
import { PlatformAuthController, PlatformController } from "./platform.controller.js";
import { PlatformJwtGuard } from "./platform-jwt.guard.js";
import { SelfHostedBootstrap } from "./self-hosted-bootstrap.service.js";
import { SupportSessionService } from "./support-session.service.js";
import { TenantDataService } from "./tenant-data.service.js";
import { TenantExportController } from "./tenant-export.controller.js";
import { TenantJobsWorker } from "./tenant-jobs.worker.js";
import { TenantProvisioningService } from "./tenant-provisioning.service.js";

export type DeploymentMode = "cloud" | "self-hosted";

/**
 * The configured `DEPLOYMENT_MODE`, defaulting to `cloud`. Reads `process.env` directly for the
 * same reason as `config/app-role.ts`: the module graph is decided at import time, before
 * `ConfigModule` exists. The value is still validated fail-fast by `env.schema.ts`.
 */
export function deploymentMode(): DeploymentMode {
  return process.env.DEPLOYMENT_MODE?.trim() === "self-hosted" ? "self-hosted" : "cloud";
}

/**
 * The platform control plane (M7 §6, design D6/D15). `forRoot(mode)`:
 *
 * - `cloud` — the full surface: platform-admin auth + guard, tenant provisioning/lifecycle,
 *   support sessions, and the platform audit log, served by `PlatformAuthController` +
 *   `PlatformController` (`contract.platform`).
 * - `self-hosted` — **no platform controllers** (no platform login surface exists to attack;
 *   `/platform/*` is a 404); only provisioning, which `SelfHostedBootstrap` uses to ensure the
 *   single `DEFAULT_TENANT_SLUG` tenant exists at boot.
 *
 * Both modes mount the tenant-side PDPA export (`TenantExportController`, M8 design D9) and — in
 * worker processes — the `tenant`-queue `TenantJobsWorker`.
 */
@Module({})
export class PlatformModule {
  static forRoot(mode: DeploymentMode = deploymentMode()): DynamicModule {
    if (mode === "self-hosted") {
      return {
        module: PlatformModule,
        controllers: [TenantExportController],
        providers: [
          PlatformAuditService,
          TenantProvisioningService,
          SelfHostedBootstrap,
          TenantDataService,
          ...(workersEnabled() ? [TenantJobsWorker] : []),
        ],
      };
    }
    return {
      module: PlatformModule,
      imports: [JwtModule.register({})],
      controllers: [PlatformAuthController, PlatformController, TenantExportController],
      providers: [
        PlatformAuditService,
        PlatformAuthService,
        PlatformJwtGuard,
        TenantProvisioningService,
        SupportSessionService,
        TenantDataService,
        ...(workersEnabled() ? [TenantJobsWorker] : []),
      ],
    };
  }
}
