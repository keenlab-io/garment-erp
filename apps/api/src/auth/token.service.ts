import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

/**
 * Access-token claims: user id, session id, permissions version (design D5), and the tenant
 * id (M7 design D5) — after login `tid` is the sole source of tenant identity. Support-session
 * tokens additionally carry `sup`, the `support_session` id (M7 design D6).
 */
export interface AccessClaims {
  sub: string;
  sid: string;
  pv: number;
  tid: string;
  sup?: string;
}

/** Refresh-token claims: user id, session id, and tenant id (no `pv`). */
export interface RefreshClaims {
  sub: string;
  sid: string;
  tid: string;
}

/**
 * Issues and verifies JWTs. Secrets and TTLs come from validated config; the
 * access token carries `{ sub, sid, pv, tid }` (+ `sup` for support sessions) and the
 * refresh token `{ sub, sid, tid }` (authentication spec).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(claims: AccessClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.getOrThrow<string>("JWT_ACCESS_TTL"),
    });
  }

  signRefresh(claims: RefreshClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: this.config.getOrThrow<string>("JWT_REFRESH_TTL"),
    });
  }

  verifyAccess(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAsync<AccessClaims>(token, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  verifyRefresh(token: string): Promise<RefreshClaims> {
    return this.jwt.verifyAsync<RefreshClaims>(token, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
    });
  }
}
