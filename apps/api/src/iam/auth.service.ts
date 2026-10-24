import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import {
  authIdentity,
  role,
  session,
  subscription,
  tenant,
  user,
  userRole,
  type Db,
} from "@erp/db";
import {
  entitledModules,
  type AuthProvider,
  type MeResponse,
  type TokenPair,
} from "@erp/contracts";
import { graceEnd } from "../platform/billing/dunning-schedule.js";
import { PasswordService } from "../auth/password.service.js";
import { TokenService } from "../auth/token.service.js";
import type { AuthUser } from "../auth/auth-user.js";
import {
  ForbiddenError,
  StateConflictError,
  UnauthenticatedError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { EntitlementsService } from "../platform/entitlements.service.js";
import { SeatService } from "../platform/seat.service.js";
import {
  currentTenant,
  isTenantId,
  runWithTenant,
} from "../tenancy/tenant-context.js";
import { RolePermissionResolver } from "./role-permission.resolver.js";
import {
  durationToSeconds,
  isLocked,
  lockoutUntil,
  shouldLock,
} from "./iam.util.js";

/**
 * Authentication service (spec §1.5). Owns login (with argon2id verification and the
 * lockout policy), refresh, logout, and the `GET /auth/me` projection. A session row
 * snapshots the user's `permissionsVersion` at issuance so the M0 guard can reject a
 * token once the version bumps (instant revocation, design D2).
 *
 * Tenancy (M7 design D5/D10): login resolves credentials by `(tenant_id, username)` against
 * the host-resolved tenant, so lockout counters are per tenant account; tokens carry `tid` and
 * the session row carries the tenant. Every read/write runs in a tenant transaction.
 *
 * M10 (design D8): every sign-in method resolves the caller through an `auth_identity` row —
 * password login through `(tenant_id, PASSWORD, username)`, Google through
 * `(tenant_id, GOOGLE, sub)` — and every method lands in the same `issueSession`.
 */

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly uow: UnitOfWork,
    private readonly events: EventBusService,
    private readonly resolver: RolePermissionResolver,
    private readonly entitlements: EntitlementsService,
    private readonly seats: SeatService,
  ) {}

  /**
   * Verify credentials and issue a token pair. Enforces the lockout policy: a bad
   * password increments `failed_login_count` and, at the threshold, sets
   * `locked_until`; a locked account is refused even with the correct password.
   * A successful login resets the counter and creates a session.
   */
  async login(username: string, password: string): Promise<TokenPair> {
    // The tenant comes from the host the browser connected to (TenantResolutionMiddleware,
    // design D5) — never from the request body. An unresolved host has no tenant to log into:
    // refuse, with the same error as a bad password so hostnames cannot be probed. Self-hosted
    // deployments resolve every host to their single tenant, so they never reach this.
    const scope = currentTenant();
    if (!scope) throw new UnauthenticatedError("Invalid credentials");
    return runWithTenant(scope.tenantId, scope.source, () =>
      this.loginInTenant(scope.tenantId, username, password),
    );
  }

  private async loginInTenant(
    tenantId: string,
    username: string,
    password: string,
  ): Promise<TokenPair> {
    const row = await this.uow.withTransaction(async () => {
      // Resolve through the PASSWORD identity (M10 design D8); the hash stays on `user`.
      const [found] = await currentExecutor(this.db)
        .select({
          id: user.id,
          identityId: authIdentity.id,
          status: user.status,
          passwordHash: user.passwordHash,
          permissionsVersion: user.permissionsVersion,
          failedLoginCount: user.failedLoginCount,
          lockedUntil: user.lockedUntil,
        })
        .from(authIdentity)
        .innerJoin(user, eq(user.id, authIdentity.userId))
        .where(
          and(
            eq(authIdentity.tenantId, tenantId),
            eq(authIdentity.provider, "PASSWORD"),
            eq(authIdentity.subject, username),
            eq(user.tenantId, tenantId),
          ),
        )
        .limit(1);
      return found;
    });

    // Unknown username, or an OIDC-only account with no PASSWORD identity (a demo guest) — the
    // same generic failure as a bad password (no user enumeration), refused before any hash
    // check, so no lockout counter moves for a credential that does not exist.
    if (!row) throw new UnauthenticatedError("Invalid credentials");

    const now = Date.now();
    if (isLocked(row.lockedUntil, now)) {
      throw new UnauthenticatedError("Account is temporarily locked");
    }

    const ok = await this.passwords.verify(row.passwordHash, password);
    if (!ok) {
      // Persist the failed attempt in its OWN transaction so the lockout counter
      // survives — this write must not roll back when we throw below.
      const failed = row.failedLoginCount + 1;
      await this.uow.withTransaction(async () => {
        await currentExecutor(this.db)
          .update(user)
          .set({
            failedLoginCount: failed,
            lockedUntil: shouldLock(failed) ? lockoutUntil(now) : row.lockedUntil,
          })
          .where(eq(user.id, row.id));
      });
      throw new UnauthenticatedError("Invalid credentials");
    }

    // Correct password, but the account must be ACTIVE to sign in.
    if (row.status !== "ACTIVE") {
      throw new UnauthenticatedError("Account is not active");
    }

    // Success — reset the counter, create the session, and audit atomically.
    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      await ex
        .update(user)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(now) })
        .where(eq(user.id, row.id));
      await ex
        .update(authIdentity)
        .set({ lastLoginAt: new Date(now) })
        .where(eq(authIdentity.id, row.identityId));

      return this.completeSignIn(tenantId, row.id, row.permissionsVersion);
    });
  }

  /**
   * Sign in the user behind an already-verified external identity (M10 `oidc-authentication`):
   * the Google ID token proved `(tenant_id, GOOGLE, sub)`, so only the password check is skipped
   * — the user must still be ACTIVE and not locked, and the session/tokens/`UserLoggedIn` are the
   * exact ones password login produces. `null` when no such identity exists in the tenant.
   */
  async signInWithIdentity(
    tenantId: string,
    provider: AuthProvider,
    subject: string,
  ): Promise<TokenPair | null> {
    return runWithTenant(tenantId, "host", () =>
      this.uow.withTransaction(async () => {
        const ex = currentExecutor(this.db);
        const [row] = await ex
          .select({
            id: user.id,
            identityId: authIdentity.id,
            status: user.status,
            lockedUntil: user.lockedUntil,
            permissionsVersion: user.permissionsVersion,
          })
          .from(authIdentity)
          .innerJoin(user, eq(user.id, authIdentity.userId))
          .where(
            and(
              eq(authIdentity.tenantId, tenantId),
              eq(authIdentity.provider, provider),
              eq(authIdentity.subject, subject),
              eq(user.tenantId, tenantId),
            ),
          )
          .limit(1);
        if (!row) return null;

        const now = Date.now();
        if (row.status !== "ACTIVE") throw new UnauthenticatedError("Account is not active");
        if (isLocked(row.lockedUntil, now)) {
          throw new UnauthenticatedError("Account is temporarily locked");
        }

        await ex.update(user).set({ lastLoginAt: new Date(now) }).where(eq(user.id, row.id));
        await ex
          .update(authIdentity)
          .set({ lastLoginAt: new Date(now) })
          .where(eq(authIdentity.id, row.identityId));

        return this.completeSignIn(tenantId, row.id, row.permissionsVersion);
      }),
    );
  }

  /**
   * Self-service signup through a verified Google identity (M10 design D5): creates an ACTIVE
   * user + its `GOOGLE` identity in `tenantId` and signs it in — **only** when the tenant's
   * `allow_self_signup` is true (re-read here, inside the transaction); otherwise 403 and nothing
   * is written. `tenantId` is always the host-resolved tenant bound into the OIDC `state`. The
   * account has no PASSWORD identity, so password login refuses it; its `password_hash` (NOT
   * NULL) is a hash of random bytes nobody knows.
   */
  async signUpWithGoogle(
    tenantId: string,
    identity: { sub: string; email: string },
  ): Promise<TokenPair> {
    const unusableHash = await this.passwords.hash(randomBytes(32).toString("base64url"));
    return runWithTenant(tenantId, "host", () =>
      this.uow.withTransaction(async () => {
        const ex = currentExecutor(this.db);
        const [t] = await ex
          .select({ allowSelfSignup: tenant.allowSelfSignup })
          .from(tenant)
          .where(eq(tenant.id, tenantId))
          .limit(1);
        if (!t?.allowSelfSignup) {
          throw new ForbiddenError("This organisation does not allow self-service sign-up");
        }

        const created = await this.seats.withSeatCheck(async () => {
          const [row] = await ex
            .insert(user)
            .values({
              tenantId,
              username: identity.email,
              email: identity.email,
              passwordHash: unusableHash,
              status: "ACTIVE",
            })
            .onConflictDoNothing()
            .returning({ id: user.id, permissionsVersion: user.permissionsVersion });
          // The email is already a (password) account here — never silently link to it.
          if (!row) throw new StateConflictError("An account with this email already exists");
          await ex.insert(authIdentity).values({
            tenantId,
            userId: row.id,
            provider: "GOOGLE",
            subject: identity.sub,
            email: identity.email,
            lastLoginAt: new Date(),
          });
          return row;
        });

        await ex.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, created.id));
        return this.completeSignIn(tenantId, created.id, created.permissionsVersion);
      }),
    );
  }

  /** Issue the session + token pair and emit `UserLoggedIn` — shared by every sign-in method. */
  private async completeSignIn(
    tenantId: string,
    userId: string,
    permissionsVersion: number,
  ): Promise<TokenPair> {
    const pair = await this.issueSession(tenantId, userId, permissionsVersion);

    await this.events.publishInTransaction(
      makeEvent({
        event: "iam.user.logged_in",
        actorUserId: userId,
        payload: {
          audit: {
            action: "LOGIN" as const,
            entityType: "user",
            entityId: userId,
            actorUserId: userId,
          },
        },
      }),
    );

    return pair;
  }

  /**
   * Exchange a refresh token for a fresh access token. The session must still be
   * live and its snapshotted `permissionsVersion` must match the user's current
   * version — a stale snapshot (the user's permissions changed) is refused so the
   * caller must re-login (instant revocation, design D2). The refresh token itself
   * is not rotated (design Open Question 1). The refresh token's `tid` — never the host —
   * scopes the lookups, and the re-issued access token carries the same `tid`: refresh
   * cannot move tenants.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let claims;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthenticatedError();
    }
    const { sub, sid, tid } = claims;
    if (!isTenantId(tid)) throw new UnauthenticatedError();

    const sess = await runWithTenant(tid, "jwt", () =>
      this.uow.withTransaction(async () => {
        const ex = currentExecutor(this.db);
        const [found] = await ex
          .select({
            id: session.id,
            tenantId: session.tenantId,
            permissionsVersion: session.permissionsVersion,
            revokedAt: session.revokedAt,
            expiresAt: session.expiresAt,
          })
          .from(session)
          .where(eq(session.tokenId, sid))
          .limit(1);

        if (
          !found ||
          found.tenantId !== tid ||
          found.revokedAt !== null ||
          found.expiresAt.getTime() <= Date.now()
        ) {
          throw new UnauthenticatedError();
        }

        const [u] = await ex
          .select({
            status: user.status,
            permissionsVersion: user.permissionsVersion,
          })
          .from(user)
          .where(eq(user.id, sub))
          .limit(1);

        if (
          !u ||
          u.status !== "ACTIVE" ||
          u.permissionsVersion !== found.permissionsVersion
        ) {
          throw new UnauthenticatedError();
        }
        return found;
      }),
    );

    const accessTtl = durationToSeconds(
      this.config.getOrThrow<string>("JWT_ACCESS_TTL"),
    );
    const access = await this.tokens.signAccess({
      sub,
      sid,
      pv: sess.permissionsVersion,
      tid,
    });
    return {
      access_token: access,
      refresh_token: refreshToken,
      expires_in: accessTtl,
    };
  }

  /** Revoke the caller's current session (idempotent). */
  async logout(sessionId: string): Promise<void> {
    await currentExecutor(this.db)
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.id, sessionId), isNull(session.revokedAt)));
  }

  /** The `GET /auth/me` projection — identity, tenant, bound roles, effective permissions. */
  async me(authUser: AuthUser): Promise<MeResponse> {
    const ex = currentExecutor(this.db);
    const [u] = await ex
      .select({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        employeeId: user.employeeId,
      })
      .from(user)
      .where(eq(user.id, authUser.id))
      .limit(1);
    if (!u) throw new UnauthenticatedError();

    const [t] = await ex
      .select({ id: tenant.id, name: tenant.name, slug: tenant.slug })
      .from(tenant)
      .where(eq(tenant.id, authUser.tenantId))
      .limit(1);
    if (!t) throw new UnauthenticatedError();

    const roles = await ex
      .select({ id: role.id, name: role.name })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(eq(userRole.userId, authUser.id));

    const permissions = authUser.isSuperAdmin
      ? []
      : [...(await this.resolver.resolve(authUser.id))];

    // M9: the term the shell turns into the grace countdown. Control-plane table, no RLS.
    const [sub] = await ex
      .select({ status: subscription.status, termEnd: subscription.termEnd })
      .from(subscription)
      .where(and(eq(subscription.tenantId, authUser.tenantId), isNull(subscription.deletedAt)))
      .limit(1);
    const graceDays = this.config.getOrThrow<number>("BILLING_GRACE_DAYS");

    // The same resolution the server enforces (M8 design D2) — the web never re-derives plan defaults.
    const features = await this.entitlements.resolve(authUser.tenantId);

    return {
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        status: u.status,
        is_super_admin: u.isSuperAdmin,
        employee_id: u.employeeId,
      },
      tenant: {
        ...t,
        ...(sub && sub.status !== "CANCELLED"
          ? {
              subscription: {
                status: sub.status,
                term_end: sub.termEnd.toISOString(),
                grace_ends_at: graceEnd(sub.termEnd, graceDays).toISOString(),
              },
            }
          : {}),
      },
      roles,
      permissions,
      features: { ...features },
      modules: entitledModules(features),
    };
  }

  /** Insert a session row and sign the matching access/refresh token pair. */
  private async issueSession(
    tenantId: string,
    userId: string,
    permissionsVersion: number,
  ): Promise<TokenPair> {
    const ex = currentExecutor(this.db);
    const tokenId = randomUUID();
    const now = Date.now();
    const refreshTtl = durationToSeconds(
      this.config.getOrThrow<string>("JWT_REFRESH_TTL"),
    );
    const accessTtl = durationToSeconds(
      this.config.getOrThrow<string>("JWT_ACCESS_TTL"),
    );

    await ex.insert(session).values({
      tenantId,
      userId,
      tokenId,
      permissionsVersion,
      expiresAt: new Date(now + refreshTtl * 1000),
    });

    const access = await this.tokens.signAccess({
      sub: userId,
      sid: tokenId,
      pv: permissionsVersion,
      tid: tenantId,
    });
    const refresh = await this.tokens.signRefresh({
      sub: userId,
      sid: tokenId,
      tid: tenantId,
    });

    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: accessTtl,
    };
  }
}
