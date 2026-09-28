import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import { platformAdmin, platformSession, type Db } from "@erp/db";
import type { PlatformMeResponse, PlatformTokenPair } from "@erp/contracts";
import { PasswordService } from "../auth/password.service.js";
import { PLATFORM_AUDIENCE } from "../auth/token.service.js";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { durationToSeconds, isLocked, lockoutUntil, shouldLock } from "../iam/iam.util.js";
import { PlatformAuditService } from "./platform-audit.service.js";

/** Audience of the platform refresh token — never a valid access token. */
export const PLATFORM_REFRESH_AUDIENCE = "erp-platform-refresh";

/**
 * Claims of a platform-admin token (M8 design D7): the admin id `pid` and the session id `sid`
 * (the `platform_session.token_id`). **No `tid` and no `sub`** — a platform admin belongs to no
 * tenant, and the missing `sub`/`tid` means a platform token can never satisfy the tenant
 * `JwtGuard` even if its audience check were bypassed.
 */
export interface PlatformClaims {
  pid: string;
  sid: string;
}

/** The authenticated platform admin the `PlatformJwtGuard` attaches to the request. */
export interface PlatformPrincipal {
  id: string;
  email: string;
  /** `platform_session.id` of the session the token belongs to — what logout revokes. */
  sessionId: string;
}

/**
 * `platform_admin` authentication (M7 design D6, M8 design D7). argon2id credentials and a
 * lockout policy with parity to tenant login (`iam.util`: 5 consecutive failures → 15-minute
 * lock; the counter is persisted in its own transaction so it survives the 401). A successful
 * login opens a `platform_session` row and signs `{pid, sid}` tokens with `JWT_PLATFORM_SECRET`
 * (falling back to `JWT_ACCESS_SECRET`) under the `erp-platform` audience: the tenant
 * `TokenService.verifyAccess` refuses that audience and this service requires it, so neither
 * principal's token passes the other's guard. Like tenant refresh, the refresh token is not
 * rotated; logout revokes the session, which kills both tokens.
 */
@Injectable()
export class PlatformAuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly uow: UnitOfWork,
    private readonly audit: PlatformAuditService,
  ) {}

  async login(email: string, password: string): Promise<PlatformTokenPair> {
    const [row] = await currentExecutor(this.db)
      .select({
        id: platformAdmin.id,
        status: platformAdmin.status,
        passwordHash: platformAdmin.passwordHash,
        failedLoginCount: platformAdmin.failedLoginCount,
        lockedUntil: platformAdmin.lockedUntil,
      })
      .from(platformAdmin)
      .where(eq(platformAdmin.email, email))
      .limit(1);

    // Unknown email — same generic failure as a bad password (no account enumeration).
    if (!row) throw new UnauthenticatedError("Invalid credentials");

    const now = Date.now();
    if (isLocked(row.lockedUntil, now)) {
      throw new UnauthenticatedError("Account is temporarily locked");
    }

    if (!(await this.passwords.verify(row.passwordHash, password))) {
      const failed = row.failedLoginCount + 1;
      await this.uow.withTransaction(async () => {
        await currentExecutor(this.db)
          .update(platformAdmin)
          .set({
            failedLoginCount: failed,
            lockedUntil: shouldLock(failed) ? lockoutUntil(now) : row.lockedUntil,
          })
          .where(eq(platformAdmin.id, row.id));
      });
      throw new UnauthenticatedError("Invalid credentials");
    }

    if (row.status !== "ACTIVE") {
      throw new UnauthenticatedError("Account is not active");
    }

    // Success — reset the counter, open the session, and audit atomically.
    return this.uow.withTransaction(async () => {
      await currentExecutor(this.db)
        .update(platformAdmin)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(platformAdmin.id, row.id));

      const tokenId = randomUUID();
      const [created] = await currentExecutor(this.db)
        .insert(platformSession)
        .values({
          platformAdminId: row.id,
          tokenId,
          expiresAt: new Date(now + this.refreshTtlSeconds() * 1000),
        })
        .returning({ id: platformSession.id });

      await this.audit.append({
        action: "LOGIN",
        entityType: "platform_admin",
        entityId: row.id,
        platformAdminId: row.id,
        after: { session_id: created?.id ?? null },
      });

      const claims: PlatformClaims = { pid: row.id, sid: tokenId };
      const [access, refresh] = await Promise.all([
        this.signAccess(claims),
        this.jwt.signAsync(claims, {
          secret: this.secret(),
          audience: PLATFORM_REFRESH_AUDIENCE,
          expiresIn: this.config.getOrThrow<string>("JWT_REFRESH_TTL"),
        }),
      ]);
      return { access_token: access, refresh_token: refresh, expires_in: this.accessTtlSeconds() };
    });
  }

  /**
   * Exchange a platform refresh token for a fresh access token on the same session. The session
   * must still be live and its admin ACTIVE and unlocked; the refresh token is returned as-is
   * (not rotated — parity with tenant refresh).
   */
  async refresh(refreshToken: string): Promise<PlatformTokenPair> {
    const claims = await this.verify(refreshToken, PLATFORM_REFRESH_AUDIENCE);
    await this.loadSession(claims);
    return {
      access_token: await this.signAccess(claims),
      refresh_token: refreshToken,
      expires_in: this.accessTtlSeconds(),
    };
  }

  /** Revoke the caller's session — its access and refresh tokens are refused from now on. */
  async logout(principal: PlatformPrincipal): Promise<void> {
    await this.uow.withTransaction(async () => {
      const [revoked] = await currentExecutor(this.db)
        .update(platformSession)
        .set({ revokedAt: new Date() })
        .where(and(eq(platformSession.id, principal.sessionId), isNull(platformSession.revokedAt)))
        .returning({ id: platformSession.id });
      if (!revoked) return;
      await this.audit.append({
        action: "LOGOUT",
        entityType: "platform_admin",
        entityId: principal.id,
        platformAdminId: principal.id,
        before: { session_id: revoked.id },
      });
    });
  }

  /** The `GET /platform/auth/me` projection. */
  me(principal: PlatformPrincipal): PlatformMeResponse {
    return { id: principal.id, email: principal.email };
  }

  /**
   * Verify a platform access token and load its session and admin. Any failure — bad signature,
   * wrong or missing audience (every tenant token), claims that are not `{pid, sid}`, a
   * revoked/expired/foreign session, an unknown/inactive/locked admin — is a 401.
   */
  async authenticate(token: string): Promise<PlatformPrincipal> {
    return this.loadSession(await this.verify(token, PLATFORM_AUDIENCE));
  }

  private async verify(token: string, audience: string): Promise<PlatformClaims> {
    let claims: Partial<PlatformClaims> & { sub?: unknown; tid?: unknown };
    try {
      claims = await this.jwt.verifyAsync(token, { secret: this.secret(), audience });
    } catch {
      throw new UnauthenticatedError();
    }
    // Exactly the platform shape: a token carrying tenant identity is never a platform token.
    if (
      typeof claims.pid !== "string" ||
      typeof claims.sid !== "string" ||
      claims.tid !== undefined ||
      claims.sub !== undefined
    ) {
      throw new UnauthenticatedError();
    }
    return { pid: claims.pid, sid: claims.sid };
  }

  private async loadSession(claims: PlatformClaims): Promise<PlatformPrincipal> {
    const [row] = await currentExecutor(this.db)
      .select({
        sessionId: platformSession.id,
        sessionAdminId: platformSession.platformAdminId,
        expiresAt: platformSession.expiresAt,
        revokedAt: platformSession.revokedAt,
        id: platformAdmin.id,
        email: platformAdmin.email,
        status: platformAdmin.status,
        lockedUntil: platformAdmin.lockedUntil,
      })
      .from(platformSession)
      .innerJoin(platformAdmin, eq(platformAdmin.id, platformSession.platformAdminId))
      .where(eq(platformSession.tokenId, claims.sid))
      .limit(1);

    const now = Date.now();
    if (
      !row ||
      row.sessionAdminId !== claims.pid ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= now ||
      row.status !== "ACTIVE" ||
      isLocked(row.lockedUntil, now)
    ) {
      throw new UnauthenticatedError();
    }
    return { id: row.id, email: row.email, sessionId: row.sessionId };
  }

  private signAccess(claims: PlatformClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.secret(),
      audience: PLATFORM_AUDIENCE,
      expiresIn: this.accessTtl(),
    });
  }

  private accessTtl(): string {
    return this.config.get<string>("JWT_PLATFORM_TTL") ?? "30m";
  }

  private accessTtlSeconds(): number {
    return durationToSeconds(this.accessTtl());
  }

  private refreshTtlSeconds(): number {
    return durationToSeconds(this.config.getOrThrow<string>("JWT_REFRESH_TTL"));
  }

  private secret(): string {
    return (
      this.config.get<string>("JWT_PLATFORM_SECRET") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
    );
  }
}
