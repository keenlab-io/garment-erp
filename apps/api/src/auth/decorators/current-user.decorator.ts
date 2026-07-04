import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "../auth-user.js";

/** Injects the `AuthUser` the `JwtGuard` attached to the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return request.user;
  },
);
