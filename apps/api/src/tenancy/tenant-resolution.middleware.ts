import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { tenantContext } from "./tenant-context.js";
import { TenantResolutionService, type ResolvedTenant } from "./tenant-resolution.service.js";

/** The request carries the host-resolved tenant for public handlers (e.g. tenant-context). */
export type RequestWithHostTenant = Request & { hostTenant?: ResolvedTenant };

/**
 * Pre-login tenant scope from the hostname (M7 design D5). Middleware runs before routing, so it
 * cannot read `@Public()` metadata; it keys off the credential instead: a request carrying a
 * bearer token is an authenticated call whose tenant comes from the verified `tid` claim, and
 * the (forgeable) `Host` header is **never** consulted for it. Any other request — login,
 * refresh, `GET /public/tenant-context` — has its host resolved and, on a `TENANT`-mode match,
 * runs the rest of the pipeline inside `tenantContext` (`source: "host"`). An unknown host
 * enters no context (the public endpoint 404s; login is refused once it requires a tenant).
 */
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(private readonly resolution: TenantResolutionService) {}

  async use(req: RequestWithHostTenant, _res: Response, next: NextFunction): Promise<void> {
    if (hasBearer(req.headers.authorization)) return next();

    let resolved: ResolvedTenant | null;
    try {
      resolved = await this.resolution.byHostname(req.hostname ?? "");
    } catch (err) {
      return next(err);
    }
    // DEMO_POOL hosts route into the m10 demo pool, not to one tenant — nothing to enter yet.
    if (!resolved || resolved.resolutionMode !== "TENANT") return next();

    req.hostTenant = resolved;
    tenantContext.run({ tenantId: resolved.tenantId, source: "host" }, () => next());
  }
}

function hasBearer(header: string | undefined): boolean {
  return typeof header === "string" && header.trim().toLowerCase().startsWith("bearer ");
}
