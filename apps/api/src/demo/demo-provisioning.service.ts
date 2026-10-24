import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, count, eq, sql } from "drizzle-orm";
import {
  authIdentity,
  plan,
  seedDemoTenant,
  tenant,
  tenantFeature,
  user,
  type Db,
  type Tx,
} from "@erp/db";
import type { TokenPair } from "@erp/contracts";
import type { DemoProvisioner, VerifiedGoogleGuest } from "../auth/oidc/demo-provisioner.js";
import { PasswordService } from "../auth/password.service.js";
import {
  RateLimitedError,
  ServiceUnavailableError,
  UnauthenticatedError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { AuthService } from "../iam/auth.service.js";
import { PlatformAuditService } from "../platform/platform-audit.service.js";
import { runWithTenant } from "../tenancy/tenant-context.js";
import {
  DEMO_FEATURE_DEFAULTS,
  DEMO_PLAN_CODE,
  DEMO_TENANT_NAME,
} from "./demo.constants.js";
import { DemoStore, type DemoSignupSlot } from "./demo-store.service.js";

/**
 * Transaction-scoped advisory-lock key serialising the count-and-create of sandboxes, so
 * concurrent first-time callbacks near the cap can never overshoot it (`demo-guardrails` spec).
 * An arbitrary fixed key, unique to this use in the codebase.
 */
export const DEMO_CAP_LOCK_KEY = 731_010_001;

/** The friendly at-capacity message the landing page shows (503). */
export const DEMO_BUSY_MESSAGE = "The demo is busy right now — please try again shortly";

/**
 * Per-guest sandbox provisioning (M10 task 4.2, `demo-sandbox-provisioning` spec, design D1/D2) —
 * the `DEMO_PROVISIONER` the OIDC callback hands an unknown demo-pool guest to.
 *
 * 1. **Rate limits** (Redis, before anything else): at most `DEMO_SIGNUP_RATE_PER_IP` creations
 *    per IP per hour and `DEMO_SIGNUP_RATE_PER_EMAIL` per email per day, else 429. Only creation
 *    is limited — a returning guest is resumed by the OIDC layer and never reaches this.
 * 2. **One transaction**, entered under the new tenant id (`runWithTenant(id, "system")`, so RLS
 *    admits the seed's rows): a `pg_advisory_xact_lock` + count of ACTIVE sandboxes against
 *    `DEMO_MAX_CONCURRENT_SANDBOXES` (503 at the cap); the `tenant` row (`DEMO_SANDBOX`, `ACTIVE`,
 *    `allow_self_signup`); `seedDemoTenant`; the guest `user` (tenant super-admin, an unusable
 *    password hash and **no** `PASSWORD` identity — password login refuses it); the
 *    `(tenant, GOOGLE, sub)` identity; the demo-path `tenant_feature` rows; a `platform_audit_log`
 *    row (tenant id and dataset counts — never the guest's email, which must die with the
 *    sandbox); and finally the session + token pair via `AuthService.signInWithIdentity`, which
 *    joins the same transaction. Any failure rolls all of it back, so no half-seeded sandbox is
 *    ever issued a token; the rate-limit slot is then given back.
 *
 * The lead opt-in starts unset (design D6) and is recorded later through `setLeadOptIn`.
 */
@Injectable()
export class DemoProvisioningService implements DemoProvisioner {
  private readonly logger = new Logger(DemoProvisioningService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly audit: PlatformAuditService,
    private readonly store: DemoStore,
    private readonly config: ConfigService,
  ) {}

  async provision(guest: VerifiedGoogleGuest, ctx: { ip: string | null }): Promise<TokenPair> {
    const slot = await this.store.takeSignupSlot(ctx.ip, guest.email);
    try {
      this.assertWithinRateLimits(slot);
      // Hash outside the transaction — argon2id is deliberately slow. Nobody knows the input.
      const unusableHash = await this.passwords.hash(randomBytes(32).toString("base64url"));
      return await this.createSandbox(guest, unusableHash);
    } catch (err) {
      await this.store.releaseSignupSlot(slot).catch((releaseErr: unknown) => {
        this.logger.warn(`could not release a demo signup slot: ${String(releaseErr)}`);
      });
      throw err;
    }
  }

  /** Whether the pool is at its cap — the landing page's `busy` flag (`GET /demo/status`). */
  async atCapacity(): Promise<boolean> {
    return (await this.activeSandboxes(this.db)) >= this.maxSandboxes();
  }

  /**
   * Record (or withdraw) the guest's PDPA lead opt-in on their sandbox (design D6). Only a
   * `DEMO_SANDBOX` row is ever touched; withdrawing clears the consent timestamp.
   */
  async setLeadOptIn(tenantId: string, optIn: boolean): Promise<void> {
    await currentExecutor(this.db)
      .update(tenant)
      .set({ demoLeadConsentedAt: optIn ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(tenant.id, tenantId), eq(tenant.kind, "DEMO_SANDBOX")));
  }

  private assertWithinRateLimits(slot: DemoSignupSlot): void {
    const perIp = this.config.get<number>("DEMO_SIGNUP_RATE_PER_IP") ?? 3;
    const perEmail = this.config.get<number>("DEMO_SIGNUP_RATE_PER_EMAIL") ?? 2;
    if (slot.ipCount > perIp || slot.emailCount > perEmail) {
      throw new RateLimitedError("Too many demo sign-ups — please try again later");
    }
  }

  private async createSandbox(guest: VerifiedGoogleGuest, passwordHash: string): Promise<TokenPair> {
    const id = randomUUID();
    return runWithTenant(id, "system", () =>
      this.uow.withTransaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${DEMO_CAP_LOCK_KEY}::bigint)`);
        if ((await this.activeSandboxes(tx)) >= this.maxSandboxes()) {
          throw new ServiceUnavailableError(DEMO_BUSY_MESSAGE);
        }

        const [demoPlan] = await tx
          .select({ id: plan.id })
          .from(plan)
          .where(eq(plan.code, DEMO_PLAN_CODE))
          .limit(1);
        await tx.insert(tenant).values({
          id,
          name: DEMO_TENANT_NAME,
          slug: `demo-${id}`,
          kind: "DEMO_SANDBOX",
          status: "ACTIVE",
          allowSelfSignup: true,
          planId: demoPlan?.id ?? null,
          demoGuestName: guest.name,
        });
        const dataset = await seedDemoTenant(tx, id);

        const [guestUser] = await tx
          .insert(user)
          .values({
            tenantId: id,
            username: guest.email,
            email: guest.email,
            passwordHash,
            status: "ACTIVE",
            isSuperAdmin: true,
          })
          .returning({ id: user.id });
        if (!guestUser) throw new Error("demo guest user was not created");
        await tx.insert(authIdentity).values({
          tenantId: id,
          userId: guestUser.id,
          provider: "GOOGLE",
          subject: guest.sub,
          email: guest.email,
        });
        await tx.insert(tenantFeature).values(
          Object.entries(DEMO_FEATURE_DEFAULTS).map(([key, enabled]) => ({
            tenantId: id,
            key,
            enabled,
          })),
        );
        await this.audit.append({
          action: "CREATE",
          entityType: "tenant",
          entityId: id,
          tenantId: id,
          reason: "demo sandbox provisioned",
          // Counts only: the guest's email/name must not outlive the sandbox (design D6).
          after: { kind: "DEMO_SANDBOX", status: "ACTIVE", dataset },
        });

        const tokens = await this.auth.signInWithIdentity(id, "GOOGLE", guest.sub);
        if (!tokens) throw new UnauthenticatedError("Demo sign-in failed");
        return tokens;
      }),
    );
  }

  private async activeSandboxes(ex: Db | Tx): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(tenant)
      .where(and(eq(tenant.kind, "DEMO_SANDBOX"), eq(tenant.status, "ACTIVE")));
    return Number(row?.n ?? 0);
  }

  private maxSandboxes(): number {
    return this.config.get<number>("DEMO_MAX_CONCURRENT_SANDBOXES") ?? 25;
  }
}
