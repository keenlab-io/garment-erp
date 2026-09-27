import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ForbiddenError, TenantReadOnlyError } from "../common/errors/app-exception.js";
import { currentTenantId } from "./tenant-context.js";
import { TenantResolutionService } from "./tenant-resolution.service.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The one central `TenantStatus` gate (M7 tenant-resolution spec). Runs after `JwtGuard`, for
 * whatever tenant is in scope — host-resolved on public routes (so login is covered) or the
 * token's tenant on authenticated ones:
 *
 * - `SUSPENDED` / `PURGING` → 403 on every request, reads and login included;
 * - `READ_ONLY` → 403 `TENANT_READ_ONLY` on mutating methods; reads keep working.
 *
 * M7 ships the mechanism only — the billing policy that flips a tenant's status is m8. A tenant
 * id in scope with no tenant row fails closed.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private readonly resolution: TenantResolutionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const tenantId = currentTenantId();
    if (tenantId === null) return true;

    const status = await this.resolution.statusOf(tenantId);
    switch (status) {
      case "ACTIVE":
        return true;
      case "READ_ONLY": {
        const method = context.switchToHttp().getRequest<Request>().method.toUpperCase();
        if (MUTATING.has(method)) throw new TenantReadOnlyError();
        return true;
      }
      case "SUSPENDED":
      case "PURGING":
        throw new ForbiddenError("Tenant is not active");
      default:
        throw new ForbiddenError("Unknown tenant");
    }
  }
}
