import { describe, expect, it } from "vitest";
import { DEMO_PROVISIONER } from "../auth/oidc/demo-provisioner.js";
import { LOGOUT_HOOK } from "../iam/logout-hook.js";
import { DemoController, DemoStatusController } from "./demo.controller.js";
import { DemoModule } from "./demo.module.js";
import { DemoGuardService } from "./demo-guard.service.js";
import { DemoProvisioningService } from "./demo-provisioning.service.js";

// M10 task 4.7 / 8.4 — the demo surface exists only in cloud mode; self-hosted keeps just the
// egress guard (which never sees a sandbox).
describe("DemoModule.forRoot", () => {
  it("mounts the demo endpoints and binds the OIDC + logout seams in cloud mode", () => {
    const mod = DemoModule.forRoot("cloud");
    expect(mod.global).toBe(true);
    expect(mod.controllers).toEqual([DemoStatusController, DemoController]);
    expect(mod.providers).toContain(DemoProvisioningService);
    expect(mod.exports).toEqual(expect.arrayContaining([DemoGuardService, DEMO_PROVISIONER, LOGOUT_HOOK]));
  });

  it("exposes no demo endpoint, provisioner or logout hook in self-hosted mode", () => {
    const mod = DemoModule.forRoot("self-hosted");
    expect(mod.controllers ?? []).toEqual([]);
    expect(mod.providers).toEqual([DemoGuardService]);
    expect(mod.exports).toEqual([DemoGuardService]);
  });
});
