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
import type { AuthUser } from "./auth-user.js";
import {
  PERMISSION_RESOLVER,
  SESSION_LOOKUP,
  USER_LOOKUP,
  type PermissionResolver,
  type SessionLookup,
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
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @Inject(USER_LOOKUP) private readonly users: UserLookup,
    @Inject(SESSION_LOOKUP) private readonly sessions: SessionLookup,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: PermissionResolver,
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

    const session = await this.sessions.byTokenId(claims.sid);
    if (
      !session ||
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

    const authUser: AuthUser = {
      id: user.id,
      sessionId: session.id,
      isSuperAdmin: user.isSuperAdmin,
      permissions,
    };
    (request as Request & { user?: AuthUser }).user = authUser;
    return true;
  }
}

/** Extract the bearer token from an `Authorization` header, or `null`. */
function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : null;
}
