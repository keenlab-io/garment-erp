import { Controller, Req, Res } from "@nestjs/common";
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest";
import type { Request, Response } from "express";
import { API_PREFIX, OIDC_WEB_COMPLETE_PATH, contract } from "@erp/contracts";
import { NotFoundError, UnauthenticatedError } from "../../common/errors/app-exception.js";
import { TenantResolutionService, normalizeHost } from "../../tenancy/tenant-resolution.service.js";
import { Public } from "../decorators/public.decorator.js";
import { OidcLoginService } from "./oidc-login.service.js";
import {
  OIDC_FLOW_COOKIE,
  OIDC_FLOW_TTL_SECONDS,
  OidcService,
  type OidcBinding,
} from "./oidc.service.js";

const OIDC_COOKIE_PATH = `${API_PREFIX}/auth/oidc`;
const CALLBACK_PATH = `${API_PREFIX}/auth/oidc/google/callback`;

/**
 * Google OIDC endpoints (M10 task 3.4) — `contract.demo`'s `oidcGoogleStart` /
 * `oidcGoogleCallback`. `@Public()` at the class level (M0 design D7). The tenant is resolved
 * here from the hostname (both `TENANT` and `DEMO_POOL` rows — the middleware enters no context
 * for the latter) and bound into `state`; any `tenant_id` a client sends is simply never read.
 *
 * Success ends in a 302 to the web's `OIDC_WEB_COMPLETE_PATH` with the standard token pair in
 * the URL fragment; every failure is the uniform error envelope (401 bad state, 403 refused).
 */
@Public()
@Controller()
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly login: OidcLoginService,
    private readonly resolution: TenantResolutionService,
  ) {}

  @TsRestHandler(contract.demo.oidcGoogleStart)
  start(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(contract.demo.oidcGoogleStart, async ({ query }) => {
      this.oidc.assertConfigured();
      const binding = await this.bindingFor(req);
      await this.login.assertGoogleEnabled(binding);

      const { url, flowCookie } = await this.oidc.start(
        binding,
        redirectUri(req),
        query.return_to,
      );
      res.cookie(OIDC_FLOW_COOKIE, flowCookie, {
        httpOnly: true,
        // Lax: Google's redirect back is a top-level GET navigation, which Lax still sends on.
        sameSite: "lax",
        secure: requestProto(req) === "https",
        path: OIDC_COOKIE_PATH,
        maxAge: OIDC_FLOW_TTL_SECONDS * 1000,
      });
      res.setHeader("Location", url);
      return { status: 302 as const, body: undefined };
    });
  }

  @TsRestHandler(contract.demo.oidcGoogleCallback)
  callback(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(contract.demo.oidcGoogleCallback, async ({ query }) => {
      this.oidc.assertConfigured();
      // One-shot: the flow cookie is spent whatever the outcome.
      const flowCookie = readCookie(req.headers.cookie, OIDC_FLOW_COOKIE);
      res.clearCookie(OIDC_FLOW_COOKIE, { path: OIDC_COOKIE_PATH });

      const binding = await this.bindingFor(req);
      // State first: a tampered / expired / cross-tenant callback never reaches Google.
      const flow = await this.oidc.verifyFlow(query.state, flowCookie, binding);
      if (query.error || !query.code) {
        throw new UnauthenticatedError("Google sign-in was not completed");
      }
      await this.login.assertGoogleEnabled(binding);

      const identity = await this.oidc.exchange(query.code, flow, redirectUri(req));
      const { tokens, demo } = await this.login.signIn(binding, identity, { ip: req.ip ?? null });

      const fragment = new URLSearchParams({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: String(tokens.expires_in),
        return_to: flow.returnTo,
        ...(demo ? { demo: "1" } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Location", `${OIDC_WEB_COMPLETE_PATH}#${fragment.toString()}`);
      return { status: 302 as const, body: undefined };
    });
  }

  /** The hostname-resolved tenant (or demo pool) this flow belongs to; unknown host ⇒ 404. */
  private async bindingFor(req: Request): Promise<OidcBinding> {
    const host = normalizeHost(req.hostname ?? "");
    const resolved = await this.resolution.byHostname(host);
    if (!resolved) throw new NotFoundError("No tenant serves this hostname");
    return { mode: resolved.resolutionMode, tenantId: resolved.tenantId, host };
  }
}

/** `https` behind the TLS-terminating ingress (first `X-Forwarded-Proto` hop), else Express's. */
function requestProto(req: Request): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.protocol;
}

/**
 * The absolute callback URL registered with Google. Built from the request's own host: Google
 * only redirects to registered URIs, so a forged `Host` cannot divert the code anywhere.
 */
function redirectUri(req: Request): string {
  return `${requestProto(req)}://${req.get("host") ?? req.hostname}${CALLBACK_PATH}`;
}

/** Read one cookie from a raw `Cookie` header (no cookie-parser in this app). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
