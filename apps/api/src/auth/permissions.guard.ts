import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Permission } from "@erp/contracts";
import {
  ForbiddenError,
  UnauthenticatedError,
} from "../common/errors/app-exception.js";
import type { AuthUser } from "./auth-user.js";
import { PERMISSIONS_KEY } from "./decorators/permissions.decorator.js";

/**
 * Enforces `@Permissions()` metadata on plain (non-ts-rest) controllers. ts-rest
 * endpoints authorize in-handler via `assertPermissions` instead (M0 design D7).
 * Super-admins bypass. Runs after `JwtGuard`, so `request.user` is populated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new UnauthenticatedError();
    if (user.isSuperAdmin) return true;

    const missing = required.filter((code) => !user.permissions.has(code));
    if (missing.length > 0) {
      throw new ForbiddenError(
        `Missing required permission(s): ${missing.join(", ")}`,
      );
    }
    return true;
  }
}
