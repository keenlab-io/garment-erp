import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import { platformAdmin, type Db } from "@erp/db";
import type { PlatformTokenPair } from "@erp/contracts";
import { PasswordService } from "../auth/password.service.js";
import { PLATFORM_AUDIENCE } from "../auth/token.service.js";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { durationToSeconds, isLocked, lockoutUntil, shouldLock } from "../iam/iam.util.js";
import { PlatformAuditService } from "./platform-audit.service.js";

/** Audience of the (currently unconsumed) platform refresh token — never a valid access token. */
export const PLATFORM_REFRESH_AUDIENCE = "erp-platform-refresh";

/** Claims of a platform-admin access token. No `tid`: a platform admin belongs to no tenant. */
export interface PlatformClaims {
  sub: string;
}

/** The authenticated platform admin the `PlatformGuard` attaches to the request. */
export interface PlatformPrincipal {
  id: string;
  email: string;
}

/**
 * `platform_admin` authentication (M7 design D6). argon2id credentials and a lockout policy that
 * mirrors the tenant one (`iam.util`: 5 consecutive failures → 15-minute lock; the counter is
 * persisted in its own transaction so it survives the 401). Tokens are signed with
 * `JWT_PLATFORM_SECRET` (falling back to `JWT_ACCESS_SECRET`) and stamped with the
 * `erp-platform` audience: the tenant `TokenService.verifyAccess` refuses that audience and this
 * service requires it, so neither principal's token passes the other's guard.
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

    await this.uow.withTransaction(async () => {
      await currentExecutor(this.db)
        .update(platformAdmin)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(platformAdmin.id, row.id));
      await this.audit.append({
        action: "LOGIN",
        entityType: "platform_admin",
        entityId: row.id,
        platformAdminId: row.id,
      });
    });

    const ttl = this.config.get<string>("JWT_PLATFORM_TTL") ?? "30m";
    const claims: PlatformClaims = { sub: row.id };
    const [access, refresh] = await Promise.all([
      this.jwt.signAsync(claims, {
        secret: this.secret(),
        audience: PLATFORM_AUDIENCE,
        expiresIn: ttl,
      }),
      this.jwt.signAsync(claims, {
        secret: this.secret(),
        audience: PLATFORM_REFRESH_AUDIENCE,
        expiresIn: this.config.getOrThrow<string>("JWT_REFRESH_TTL"),
      }),
    ]);
    return { access_token: access, refresh_token: refresh, expires_in: durationToSeconds(ttl) };
  }

  /**
   * Verify a platform access token and load its admin. Any failure — bad signature, wrong or
   * missing audience (every tenant token), unknown/inactive/locked admin — is a 401.
   */
  async authenticate(token: string): Promise<PlatformPrincipal> {
    let claims: PlatformClaims;
    try {
      claims = await this.jwt.verifyAsync<PlatformClaims>(token, {
        secret: this.secret(),
        audience: PLATFORM_AUDIENCE,
      });
    } catch {
      throw new UnauthenticatedError();
    }

    const [admin] = await currentExecutor(this.db)
      .select({
        id: platformAdmin.id,
        email: platformAdmin.email,
        status: platformAdmin.status,
        lockedUntil: platformAdmin.lockedUntil,
      })
      .from(platformAdmin)
      .where(eq(platformAdmin.id, claims.sub))
      .limit(1);
    if (!admin || admin.status !== "ACTIVE" || isLocked(admin.lockedUntil, Date.now())) {
      throw new UnauthenticatedError();
    }
    return { id: admin.id, email: admin.email };
  }

  private secret(): string {
    return (
      this.config.get<string>("JWT_PLATFORM_SECRET") ??
      this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
    );
  }
}
