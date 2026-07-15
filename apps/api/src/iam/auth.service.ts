import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull } from "drizzle-orm";
import { role, session, user, userRole, type Db } from "@erp/db";
import type { MeResponse, TokenPair } from "@erp/contracts";
import { PasswordService } from "../auth/password.service.js";
import { TokenService } from "../auth/token.service.js";
import type { AuthUser } from "../auth/auth-user.js";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
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
  ) {}

  /**
   * Verify credentials and issue a token pair. Enforces the lockout policy: a bad
   * password increments `failed_login_count` and, at the threshold, sets
   * `locked_until`; a locked account is refused even with the correct password.
   * A successful login resets the counter and creates a session.
   */
  async login(username: string, password: string): Promise<TokenPair> {
    const [row] = await this.db
      .select({
        id: user.id,
        status: user.status,
        passwordHash: user.passwordHash,
        permissionsVersion: user.permissionsVersion,
        failedLoginCount: user.failedLoginCount,
        lockedUntil: user.lockedUntil,
      })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);

    // Unknown username — same generic failure as a bad password (no user enumeration).
    if (!row) throw new UnauthenticatedError("Invalid credentials");

    const now = Date.now();
    if (isLocked(row.lockedUntil, now)) {
      throw new UnauthenticatedError("Account is temporarily locked");
    }

    const ok = await this.passwords.verify(row.passwordHash, password);
    if (!ok) {
      // Persist the failed attempt OUTSIDE any transaction so the lockout counter
      // survives — this write must not roll back when we throw below.
      const failed = row.failedLoginCount + 1;
      await this.db
        .update(user)
        .set({
          failedLoginCount: failed,
          lockedUntil: shouldLock(failed) ? lockoutUntil(now) : row.lockedUntil,
        })
        .where(eq(user.id, row.id));
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

      const pair = await this.issueSession(row.id, row.permissionsVersion);

      await this.events.publishInTransaction(
        makeEvent({
          event: "iam.user.logged_in",
          actorUserId: row.id,
          payload: {
            audit: {
              action: "LOGIN" as const,
              entityType: "user",
              entityId: row.id,
              actorUserId: row.id,
            },
          },
        }),
      );

      return pair;
    });
  }

  /**
   * Exchange a refresh token for a fresh access token. The session must still be
   * live and its snapshotted `permissionsVersion` must match the user's current
   * version — a stale snapshot (the user's permissions changed) is refused so the
   * caller must re-login (instant revocation, design D2). The refresh token itself
   * is not rotated (design Open Question 1).
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let claims;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw new UnauthenticatedError();
    }

    const ex = currentExecutor(this.db);
    const [sess] = await ex
      .select({
        id: session.id,
        permissionsVersion: session.permissionsVersion,
        revokedAt: session.revokedAt,
        expiresAt: session.expiresAt,
      })
      .from(session)
      .where(eq(session.tokenId, claims.sid))
      .limit(1);

    if (
      !sess ||
      sess.revokedAt !== null ||
      sess.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthenticatedError();
    }

    const [u] = await ex
      .select({
        status: user.status,
        permissionsVersion: user.permissionsVersion,
      })
      .from(user)
      .where(eq(user.id, claims.sub))
      .limit(1);

    if (
      !u ||
      u.status !== "ACTIVE" ||
      u.permissionsVersion !== sess.permissionsVersion
    ) {
      throw new UnauthenticatedError();
    }

    const accessTtl = durationToSeconds(
      this.config.getOrThrow<string>("JWT_ACCESS_TTL"),
    );
    const access = await this.tokens.signAccess({
      sub: claims.sub,
      sid: claims.sid,
      pv: sess.permissionsVersion,
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

  /** The `GET /auth/me` projection — identity, bound roles, effective permissions. */
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

    const roles = await ex
      .select({ id: role.id, name: role.name })
      .from(userRole)
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(eq(userRole.userId, authUser.id));

    const permissions = authUser.isSuperAdmin
      ? []
      : [...(await this.resolver.resolve(authUser.id))];

    return {
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        status: u.status,
        is_super_admin: u.isSuperAdmin,
        employee_id: u.employeeId,
      },
      roles,
      permissions,
    };
  }

  /** Insert a session row and sign the matching access/refresh token pair. */
  private async issueSession(
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
      userId,
      tokenId,
      permissionsVersion,
      expiresAt: new Date(now + refreshTtl * 1000),
    });

    const access = await this.tokens.signAccess({
      sub: userId,
      sid: tokenId,
      pv: permissionsVersion,
    });
    const refresh = await this.tokens.signRefresh({ sub: userId, sid: tokenId });

    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: accessTtl,
    };
  }
}
