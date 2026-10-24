import { type DynamicModule, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DEMO_PROVISIONER } from "../auth/oidc/demo-provisioner.js";
import { workersEnabled } from "../config/app-role.js";
import { IamModule } from "../iam/iam.module.js";
import { LOGOUT_HOOK } from "../iam/logout-hook.js";
import { PlatformAuditService } from "../platform/platform-audit.service.js";
import { deploymentMode, type DeploymentMode } from "../platform/platform.module.js";
import { DemoActivityInterceptor } from "./demo-activity.interceptor.js";
import { DemoController, DemoStatusController } from "./demo.controller.js";
import { DemoGuardService } from "./demo-guard.service.js";
import { DemoJobsWorker } from "./demo-jobs.worker.js";
import { DemoProvisioningService } from "./demo-provisioning.service.js";
import { DemoPurgeService } from "./demo-purge.service.js";
import { DemoSinkService } from "./demo-sink.service.js";
import { DemoSessionService } from "./demo-session.service.js";
import { DemoStore } from "./demo-store.service.js";
import { DemoSweepService } from "./demo-sweep.service.js";

/**
 * The public demo tier (M10 §4). Global, so its seams reach the modules that consume them
 * without importing this one: `DemoGuardService` + `DemoSinkService` (the §5 egress seams), `DEMO_PROVISIONER` (the
 * OIDC callback's new-guest path) and `LOGOUT_HOOK` (sandbox sign-out purges). `forRoot(mode)`:
 *
 * - `cloud` — the full surface: `GET /demo/status` + `POST /demo/end`, sandbox provisioning (rate
 *   limits, cap), the purge, the activity stamp, and — in worker processes — the `demo`-queue
 *   `DemoJobsWorker` (purge + idle sweep).
 * - `self-hosted` — no demo endpoint, job or provisioner at all (spec "Self-hosted has no demo
 *   pool"); only the egress seams — `DemoGuardService`, which answers `false` for the single
 *   customer tenant, and the `DemoSinkService` it never routes to.
 */
@Module({})
export class DemoModule {
  static forRoot(mode: DeploymentMode = deploymentMode()): DynamicModule {
    if (mode === "self-hosted") {
      return {
        module: DemoModule,
        global: true,
        providers: [DemoGuardService, DemoSinkService],
        exports: [DemoGuardService, DemoSinkService],
      };
    }
    return {
      module: DemoModule,
      global: true,
      imports: [IamModule],
      controllers: [DemoStatusController, DemoController],
      providers: [
        DemoGuardService,
        DemoSinkService,
        DemoStore,
        PlatformAuditService,
        DemoProvisioningService,
        { provide: DEMO_PROVISIONER, useExisting: DemoProvisioningService },
        DemoPurgeService,
        DemoSweepService,
        DemoSessionService,
        { provide: LOGOUT_HOOK, useExisting: DemoSessionService },
        { provide: APP_INTERCEPTOR, useClass: DemoActivityInterceptor },
        ...(workersEnabled() ? [DemoJobsWorker] : []),
      ],
      exports: [DemoGuardService, DemoSinkService, DEMO_PROVISIONER, LOGOUT_HOOK],
    };
  }
}
