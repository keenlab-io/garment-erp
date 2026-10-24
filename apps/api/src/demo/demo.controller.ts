import { Controller, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import type { Request } from "express";
import { contract } from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { Public } from "../auth/decorators/public.decorator.js";
import { TenantResolutionService, normalizeHost } from "../tenancy/tenant-resolution.service.js";
import { DemoProvisioningService } from "./demo-provisioning.service.js";
import { DemoSessionService } from "./demo-session.service.js";

/**
 * `GET /demo/status` (M10 task 4.7) — the landing page's availability check. Public
 * (`@Public()` at class level, M0 design D7). `available` only on a `DEMO_POOL` host with Google
 * OIDC configured and the pool under its cap; `busy` when the cap is what stands in the way
 * (the landing page then shows the friendly "try again shortly" message).
 */
@Public()
@Controller()
export class DemoStatusController {
  constructor(
    private readonly resolution: TenantResolutionService,
    private readonly provisioning: DemoProvisioningService,
    private readonly config: ConfigService,
  ) {}

  @TsRestHandler(contract.demo.status)
  status(@Req() req: Request) {
    return tsRestHandler(contract.demo.status, async () => {
      const resolved = await this.resolution.byHostname(normalizeHost(req.hostname ?? ""));
      const oidcConfigured =
        !!this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID") &&
        !!this.config.get<string>("GOOGLE_OAUTH_CLIENT_SECRET");
      const demoPool = resolved?.resolutionMode === "DEMO_POOL" && oidcConfigured;
      const busy = demoPool ? await this.provisioning.atCapacity() : false;
      return { status: 200 as const, body: { available: demoPool && !busy, busy } };
    });
  }
}

/**
 * `POST /demo/end` (M10 tasks 4.6/4.7) — "End demo & delete my data": authenticated as the
 * sandbox guest; revokes the sandbox's sessions, marks it PURGING and enqueues the purge after
 * the request transaction commits. 422 for a non-sandbox session.
 */
@Controller()
export class DemoController {
  constructor(private readonly sessions: DemoSessionService) {}

  @TsRestHandler(contract.demo.end)
  end(@CurrentUser() user: AuthUser) {
    return tsRestHandler(contract.demo.end, async () => {
      await this.sessions.end(user);
      return { status: 200 as const, body: { ended: true } };
    });
  }
}
