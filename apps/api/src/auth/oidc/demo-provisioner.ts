import type { TokenPair } from "@erp/contracts";

/**
 * DI seam for demo-pool sign-ins with no live sandbox (M10 task 3.4 → 4.2). The demo module's
 * `DemoProvisioningService` binds it; until then (and on any deployment without the demo module)
 * it is unbound and the OIDC callback refuses a new demo guest with 403, creating nothing.
 */
export const DEMO_PROVISIONER = Symbol("DEMO_PROVISIONER");

/** A Google identity whose ID token verified and whose email Google vouches for. */
export interface VerifiedGoogleGuest {
  sub: string;
  email: string;
  name: string | null;
}

export interface DemoProvisioner {
  /**
   * Provision a fresh `DEMO_SANDBOX` tenant for `guest` (rate limits, concurrent cap, seed,
   * super-admin user + `GOOGLE` identity) and sign the guest into it.
   */
  provision(guest: VerifiedGoogleGuest, ctx: { ip: string | null }): Promise<TokenPair>;
}
