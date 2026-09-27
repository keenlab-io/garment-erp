import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { PlatformAuthService, type PlatformPrincipal } from "./platform-auth.service.js";

/** A request the `PlatformGuard` admitted carries its platform admin. */
export type PlatformRequest = Request & { platformAdmin?: PlatformPrincipal };

/**
 * Authenticates the control-plane surface (M7 design D6). Platform controllers are `@Public()`
 * to the tenant `JwtGuard` (which would refuse a platform token anyway) and apply this guard
 * instead: it accepts only a platform-audience bearer token of an ACTIVE admin, so a tenant
 * token — including a support-session token — is a 401 here.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(private readonly auth: PlatformAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PlatformRequest>();
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) throw new UnauthenticatedError();
    request.platformAdmin = await this.auth.authenticate(token);
    return true;
  }
}
