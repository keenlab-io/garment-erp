import { Inject, Injectable, Optional } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { authIdentity, tenant, type Db } from "@erp/db";
import { GOOGLE_LOGIN_FEATURE_KEY, type TokenPair } from "@erp/contracts";
import { ForbiddenError } from "../../common/errors/app-exception.js";
import { DB } from "../../db/db.tokens.js";
import { UnitOfWork } from "../../db/unit-of-work.service.js";
import { AuthService } from "../../iam/auth.service.js";
import { EntitlementsService } from "../../platform/entitlements.service.js";
import { runWithTenant } from "../../tenancy/tenant-context.js";
import {
  DEMO_PROVISIONER,
  type DemoProvisioner,
  type VerifiedGoogleGuest,
} from "./demo-provisioner.js";
import type { OidcIdentity } from "./google-oidc.js";
import type { OidcBinding } from "./oidc.service.js";

/** The outcome of a verified callback: the standard token pair, and whether it is a sandbox. */
export interface OidcSignInResult {
  tokens: TokenPair;
  demo: boolean;
}

/**
 * Who a verified Google identity signs in as (M10 task 3.4, `oidc-authentication`). The tenant
 * always comes from the `state`-bound, hostname-resolved binding — never from the request.
 *
 * - `TENANT` host: `(tenant_id, GOOGLE, sub)` match → the standard `AuthService` sign-in; no
 *   match → self-signup **only** if the tenant's `allow_self_signup` is on, else 403 and nothing
 *   is created (design D5).
 * - `DEMO_POOL` host: the guest's live sandbox (an identity in an ACTIVE `DEMO_SANDBOX` tenant —
 *   `auth_identity` is RLS-exempt precisely for this cross-tenant lookup, design D8) is resumed;
 *   otherwise the guest is handed to the `DEMO_PROVISIONER` seam.
 */
@Injectable()
export class OidcLoginService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly auth: AuthService,
    private readonly entitlements: EntitlementsService,
    @Optional() @Inject(DEMO_PROVISIONER) private readonly provisioner?: DemoProvisioner,
  ) {}

  /**
   * Google login is a per-tenant capability (`auth.google` feature key); the demo pool always
   * offers it. Refused with 403 before any redirect to Google.
   */
  async assertGoogleEnabled(binding: OidcBinding): Promise<void> {
    if (binding.mode === "DEMO_POOL") return;
    const features = await runWithTenant(binding.tenantId, "host", () =>
      this.uow.withTransaction(() => this.entitlements.resolve(binding.tenantId, { fresh: true })),
    );
    if (features[GOOGLE_LOGIN_FEATURE_KEY] !== true) {
      throw new ForbiddenError("Google sign-in is not enabled for this organisation");
    }
  }

  async signIn(
    binding: OidcBinding,
    identity: OidcIdentity,
    ctx: { ip: string | null },
  ): Promise<OidcSignInResult> {
    if (binding.mode === "DEMO_POOL") {
      return { tokens: await this.signInDemoGuest(identity, ctx), demo: true };
    }

    const existing = await this.auth.signInWithIdentity(binding.tenantId, "GOOGLE", identity.sub);
    if (existing) return { tokens: existing, demo: false };

    // Unknown identity: only a self-signup tenant may create one (re-checked in the tx).
    const guest = requireVerifiedEmail(identity);
    return { tokens: await this.auth.signUpWithGoogle(binding.tenantId, guest), demo: false };
  }

  private async signInDemoGuest(
    identity: OidcIdentity,
    ctx: { ip: string | null },
  ): Promise<TokenPair> {
    const [live] = await this.db
      .select({ tenantId: authIdentity.tenantId })
      .from(authIdentity)
      .innerJoin(tenant, eq(tenant.id, authIdentity.tenantId))
      .where(
        and(
          eq(authIdentity.provider, "GOOGLE"),
          eq(authIdentity.subject, identity.sub),
          eq(tenant.kind, "DEMO_SANDBOX"),
          eq(tenant.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(tenant.createdAt))
      .limit(1);
    if (live) {
      const resumed = await this.auth.signInWithIdentity(live.tenantId, "GOOGLE", identity.sub);
      if (resumed) return resumed;
    }

    const guest = requireVerifiedEmail(identity);
    if (!this.provisioner) throw new ForbiddenError("The demo is not available right now");
    return this.provisioner.provision(guest, ctx);
  }
}

/** Any flow that would create a user needs an email Google has verified (spec scenario). */
function requireVerifiedEmail(identity: OidcIdentity): VerifiedGoogleGuest {
  if (!identity.email || !identity.email_verified) {
    throw new ForbiddenError("A verified Google email address is required to sign up");
  }
  return { sub: identity.sub, email: identity.email, name: identity.name };
}
