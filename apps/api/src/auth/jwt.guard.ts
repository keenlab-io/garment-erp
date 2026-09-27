import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Permission } from "@erp/contracts";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { enterTenant, isTenantId } from "../tenancy/tenant-context.js";
import type { AuthUser } from "./auth-user.js";
import {
  PERMISSION_RESOLVER,
  SESSION_LOOKUP,
  SUPPORT_SESSION_LOOKUP,
  USER_LOOKUP,
  type PermissionResolver,
  type SessionLookup,
  type SupportSessionLookup,
  type UserLookup,
} from "./auth.tokens.js";
import { IS_PUBLIC_KEY } from "./decorators/public.decorator.js";
import { TokenService } from "./token.service.js";

/**
 * Global authentication guard (design D5). For every non-`@Public()` request:
 * verify the JWT → load the session by `sid` (reject if revoked/expired) → load
 * the user by `sub` (reject if not ACTIVE) → assert `permissionsVersion === pv`
 * (mismatch ⇒ instant revocation) → resolve permissions → attach `AuthUser`. Any
 * failed step yields 401 UNAUTHENTICATED.
 *
 * Tenancy (M7 design D3/D5): the verified `tid` claim is entered as the request's tenant
 * (`source: "jwt"`) before any lookup, and the user/session/permission lookups run inside one
 * short tenant transaction so Row-Level Security applies to authentication itself (guards run
 * before the `TenantTransactionInterceptor`, so they cannot ride the handler's transaction). A
 * session whose `tenantId` differs from the claim is rejected.
 *
 * Support sessions (M7 design D6): a token carrying `sup` is a platform admin acting inside the
 * tenant. It is validated against its `support_session` row instead of `session`/`user` — the
 * row must belong to the `tid`, match the token's `sid`, be unrevoked and unexpired, and its
 * admin must still be ACTIVE — so revocation or expiry kills the token on the next request. The
 * principal is a tenant super-admin for the session's lifetime (the only way support can act on
 * a customer's data), and the support scope rides the tenant context so every audited mutation
 * is dual-written into `platform_audit_log`.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(USER_LOOKUP) private readonly users: UserLookup,
    @Inject(SESSION_LOOKUP) private readonly sessions: SessionLookup,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: PermissionResolver,
    private readonly uow: UnitOfWork,
    @Inject(SUPPORT_SESSION_LOOKUP) private readonly supportSessions: SupportSessionLookup,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearer(request.headers.authorization);
    if (!token) throw new UnauthenticatedError();

    let claims;
    try {
      claims = await this.tokens.verifyAccess(token);
    } catch {
      throw new UnauthenticatedError();
    }

    // A token minted before tenancy (no `tid`) or with a malformed one never authenticates.
    if (!isTenantId(claims.tid)) throw new UnauthenticatedError();
    if (claims.sup !== undefined) {
      if (!isTenantId(claims.sup)) throw new UnauthenticatedError();
      enterTenant(claims.tid, "jwt", {
        supportSessionId: claims.sup,
        platformAdminId: claims.sub,
      });
      const supportUser = await this.uow.withTransaction(() =>
        this.authenticateSupport(claims.sup as string, claims.sid, claims.tid, claims.sub),
      );
      (request as Request & { user?: AuthUser }).user = supportUser;
      return true;
    }
    enterTenant(claims.tid, "jwt");

    const authUser = await this.uow.withTransaction(async (): Promise<AuthUser> => {
      const session = await this.sessions.byTokenId(claims.sid);
      if (
        !session ||
        session.tenantId !== claims.tid ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthenticatedError();
      }

      const user = await this.users.byId(claims.sub);
      if (!user || user.status !== "ACTIVE") throw new UnauthenticatedError();

      // Instant revocation: a permissions_version bump invalidates live tokens.
      if (user.permissionsVersion !== claims.pv) throw new UnauthenticatedError();

      const permissions: ReadonlySet<Permission> = user.isSuperAdmin
        ? new Set<Permission>()
        : await this.resolver.resolve(user.id);

      return {
        id: user.id,
        sessionId: session.id,
        tenantId: claims.tid,
        ...(claims.sup ? { supportSessionId: claims.sup } : {}),
        isSuperAdmin: user.isSuperAdmin,
        permissions,
      };
    });
    (request as Request & { user?: AuthUser }).user = authUser;
    return true;
  }

  /** Validate a support-session token against its `support_session` row. */
  private async authenticateSupport(
    supportSessionId: string,
    tokenId: string,
    tenantId: string,
    platformAdminId: string,
  ): Promise<AuthUser> {
    const row = await this.supportSessions.byId(supportSessionId);
    if (
      !row ||
      row.tenantId !== tenantId ||
      row.tokenId !== tokenId ||
      row.platformAdminId !== platformAdminId ||
      !row.adminActive ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthenticatedError();
    }
    return {
      id: row.platformAdminId,
      sessionId: row.id,
      tenantId,
      supportSessionId: row.id,
      isSuperAdmin: true,
      permissions: new Set<Permission>(),
    };
  }
}

/** Extract the bearer token from an `Authorization` header, or `null`. */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}
