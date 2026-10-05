import { afterEach, describe, expect, it } from "vitest";
import { PlatformAuthController, PlatformController } from "./platform.controller.js";
import { deploymentMode, PlatformModule } from "./platform.module.js";
import { SelfHostedBootstrap } from "./self-hosted-bootstrap.service.js";
import { SupportSessionService } from "./support-session.service.js";
import { TenantDataService } from "./tenant-data.service.js";
import { TenantExportController } from "./tenant-export.controller.js";
import { TenantProvisioningService } from "./tenant-provisioning.service.js";

// M7 §6.5 / design D15 — the control plane is mounted only in `DEPLOYMENT_MODE=cloud`; a
// self-hosted process registers no platform controller (so `/platform/*` is a 404) and only
// ensures its single default tenant at boot.
describe("PlatformModule.forRoot", () => {
  const original = process.env.DEPLOYMENT_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.DEPLOYMENT_MODE;
    else process.env.DEPLOYMENT_MODE = original;
  });

  it("mounts the platform controllers and services in cloud mode", () => {
    const mod = PlatformModule.forRoot("cloud");
    expect(mod.controllers).toEqual([
      PlatformAuthController,
      PlatformController,
      TenantExportController,
    ]);
    expect(mod.providers).toContain(SupportSessionService);
    expect(mod.providers).toContain(TenantDataService);
    expect(mod.providers).not.toContain(SelfHostedBootstrap);
  });

  it("registers no platform controllers in self-hosted mode — the bootstrap and tenant export only", () => {
    const mod = PlatformModule.forRoot("self-hosted");
    expect(mod.controllers ?? []).toEqual([TenantExportController]);
    expect(mod.providers).toEqual(
      expect.arrayContaining([TenantProvisioningService, SelfHostedBootstrap, TenantDataService]),
    );
    expect(mod.providers).not.toContain(SupportSessionService);
  });

  it("reads DEPLOYMENT_MODE, defaulting to cloud", () => {
    delete process.env.DEPLOYMENT_MODE;
    expect(deploymentMode()).toBe("cloud");
    process.env.DEPLOYMENT_MODE = "self-hosted";
    expect(deploymentMode()).toBe("self-hosted");
  });
});
