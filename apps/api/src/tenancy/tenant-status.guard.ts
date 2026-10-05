import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { contract } from "@erp/contracts";
import { ForbiddenError, TenantReadOnlyError } from "../common/errors/app-exception.js";
import { currentTenantId } from "./tenant-context.js";
import { TenantResolutionService } from "./tenant-resolution.service.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The ONLY non-GET operations a READ_ONLY tenant may perform (M8 design D6): signing in and out,
 * the PDPA export trigger — portability cannot depend on being paid up — and the report export,
 * which is a read that happens to be a `POST` (the spec keeps "report/data exports" working while
 * READ_ONLY). Everything else that mutates is 403 `TENANT_READ_ONLY`. Taken from the contract
 * routes so a path change cannot drift; adding an entry is a deliberate, reviewed one-liner (the
 * unit test enumerates the set).
 */
export const READ_ONLY_WRITE_ALLOWLIST: readonly string[] = [
  contract.iam.login,
  contract.iam.refresh,
  contract.iam.logout,
  contract.iam.exportTenantData,
  contract.reporting.exportReport,
].map((route) => `${route.method} ${route.path}`);

/** `METHOD /path/:param` → an anchored matcher (a `:param` matches one path segment). */
const ALLOWLIST_PATTERNS: readonly RegExp[] = READ_ONLY_WRITE_ALLOWLIST.map(
  (entry) =>
    new RegExp(
      `^${entry
        .split("/")
        .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/")}$`,
    ),
);

/** Whether a mutating request is on the READ_ONLY allowlist (query and trailing slash ignored). */
export function isReadOnlyAllowed(method: string, rawPath: string): boolean {
  const path = (rawPath.split("?")[0] ?? "").replace(/(.)\/+$/, "$1");
  const key = `${method.toUpperCase()} ${path}`;
  return ALLOWLIST_PATTERNS.some((re) => re.test(key));
}

/**
 * The one central `TenantStatus` gate (M7 tenant-resolution spec). Runs after `JwtGuard`, for
 * whatever tenant is in scope — host-resolved on public routes (so login is covered) or the
 * token's tenant on authenticated ones:
 *
 * - `SUSPENDED` / `PURGING` → 403 on every request, reads and login included (the message sends
 *   users to the vendor — only a platform admin can act on such a tenant);
 * - `READ_ONLY` → every `GET` passes (payroll, payslips, reports, audit log, PDF renders, invoice
 *   and payroll exports), plus the `READ_ONLY_WRITE_ALLOWLIST`; every other mutation → 403 `TENANT_READ_ONLY`,
 *   which the web client renders as the renewal banner rather than a permission error.
 *
 * This is the M8 `TenantStateGuard` (design D6) — M7 shipped the mechanism, M8 the allowlist and
 * the platform lifecycle endpoints that flip the status. A tenant id in scope with no tenant row
 * fails closed.
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
        const req = context.switchToHttp().getRequest<Request>();
        const method = req.method.toUpperCase();
        if (MUTATING.has(method) && !isReadOnlyAllowed(method, req.path ?? req.url ?? "")) {
          throw new TenantReadOnlyError();
        }
        return true;
      }
      case "SUSPENDED":
      case "PURGING":
        throw new ForbiddenError(
          "This organization's account is suspended. Please contact your vendor to restore access.",
        );
      default:
        throw new ForbiddenError("Unknown tenant");
    }
  }
}
