import { createHmac, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { DomainResolutionMode } from "@erp/db";
import { BusinessRuleError, UnauthenticatedError } from "../../common/errors/app-exception.js";
import {
  GOOGLE_OIDC,
  IdTokenError,
  pkceChallenge,
  randomToken,
  safeReturnTo,
  verifyIdToken,
  type Jwk,
  type OidcIdentity,
} from "./google-oidc.js";

/** How long a started flow stays valid (state JWT + PKCE cookie lifetime). */
export const OIDC_FLOW_TTL_SECONDS = 600;
/** The HttpOnly cookie carrying the PKCE verifier between `/start` and `/callback`. */
export const OIDC_FLOW_COOKIE = "erp_oidc_flow";

const STATE_AUDIENCE = "erp-oidc-state";
const FLOW_AUDIENCE = "erp-oidc-flow";
/** Refetch Google's JWKS at most this often unless an unknown `kid` forces it. */
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * The pre-login context a flow is bound to (M10 `oidc-authentication`): the hostname-resolved
 * tenant — or the demo pool's domain row — and the host itself. Bound into `state` at `/start` and
 * compared at `/callback`, so a callback cannot be replayed against a different tenant.
 */
export interface OidcBinding {
  mode: DomainResolutionMode;
  tenantId: string;
  host: string;
}

/** What `/callback` recovers from a verified `state` + flow cookie. */
export interface VerifiedFlow {
  binding: OidcBinding;
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface StateClaims {
  jti: string;
  m: DomainResolutionMode;
  t: string;
  h: string;
  n: string;
  r: string;
}

interface FlowClaims {
  jti: string;
  v: string;
}

/**
 * Google OIDC protocol work (M10 tasks 3.3, design OQ1 — minimal fetch, no `openid-client`):
 * builds the authorization URL (PKCE S256, a signed short-TTL `state` binding tenant + nonce),
 * verifies `state` + the PKCE flow cookie, exchanges the code, and verifies the ID token against
 * Google's JWKS. It never decides *who* signs in — that is `OidcLoginService`.
 *
 * `state` and the flow cookie are HS256 JWTs under a key derived from `JWT_ACCESS_SECRET` (so no
 * new secret to provision) with their own audiences — neither can ever pass as an access token.
 * The PKCE verifier lives only in the HttpOnly cookie, never in the URL Google sees.
 */
@Injectable()
export class OidcService {
  private jwks: { keys: Jwk[]; fetchedAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Google's endpoints — or, when `GOOGLE_OIDC_BASE_URL` is set, a stub IdP's (`/authorize`,
   * `/token`, `/jwks`). A test seam for the Playwright demo flow; never set in production.
   */
  private endpoints(): Record<"authorizationEndpoint" | "tokenEndpoint" | "jwksUri", string> {
    const base = this.config.get<string>("GOOGLE_OIDC_BASE_URL");
    if (!base) return GOOGLE_OIDC;
    const root = base.replace(/\/+$/, "");
    return {
      authorizationEndpoint: `${root}/authorize`,
      tokenEndpoint: `${root}/token`,
      jwksUri: `${root}/jwks`,
    };
  }

  /** Both OAuth client settings present — otherwise every OIDC endpoint refuses. */
  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  /** Refuse with the uniform envelope (never a redirect) when OIDC is not configured. */
  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BusinessRuleError("Google sign-in is not configured");
    }
  }

  /**
   * Start a flow: the Google authorization URL to redirect to, plus the flow-cookie value the
   * controller sets. `returnTo` is sanitised to a same-origin path.
   */
  async start(
    binding: OidcBinding,
    redirectUri: string,
    returnTo: string | undefined,
  ): Promise<{ url: string; flowCookie: string }> {
    this.assertConfigured();
    const jti = randomUUID();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const secret = this.flowSecret();

    const state = await this.jwt.signAsync(
      {
        m: binding.mode,
        t: binding.tenantId,
        h: binding.host,
        n: nonce,
        r: safeReturnTo(returnTo),
      },
      { secret, audience: STATE_AUDIENCE, jwtid: jti, expiresIn: OIDC_FLOW_TTL_SECONDS },
    );
    const flowCookie = await this.jwt.signAsync(
      { v: verifier },
      { secret, audience: FLOW_AUDIENCE, jwtid: jti, expiresIn: OIDC_FLOW_TTL_SECONDS },
    );

    const url = new URL(this.endpoints().authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: this.clientId() as string,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return { url: url.toString(), flowCookie };
  }

  /**
   * Verify `/callback`'s `state` against the flow cookie and the callback's own resolved
   * binding. Tampered, expired, cookie-less, or cross-tenant ⇒ 401 — and the caller has not yet
   * talked to Google, so no code exchange is ever attempted on a bad state.
   */
  async verifyFlow(
    state: string | undefined,
    flowCookie: string | undefined,
    current: OidcBinding,
  ): Promise<VerifiedFlow> {
    if (!state || !flowCookie) throw new UnauthenticatedError("Invalid sign-in state");
    const secret = this.flowSecret();
    let claims: StateClaims;
    let flow: FlowClaims;
    try {
      claims = await this.jwt.verifyAsync<StateClaims>(state, {
        secret,
        audience: STATE_AUDIENCE,
        algorithms: ["HS256"],
      });
      flow = await this.jwt.verifyAsync<FlowClaims>(flowCookie, {
        secret,
        audience: FLOW_AUDIENCE,
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthenticatedError("Invalid sign-in state");
    }
    if (!claims.jti || claims.jti !== flow.jti) {
      throw new UnauthenticatedError("Invalid sign-in state");
    }
    if (
      claims.m !== current.mode ||
      claims.t !== current.tenantId ||
      claims.h !== current.host
    ) {
      throw new UnauthenticatedError("Sign-in state belongs to a different tenant");
    }
    return {
      binding: { mode: claims.m, tenantId: claims.t, host: claims.h },
      nonce: claims.n,
      verifier: flow.v,
      returnTo: safeReturnTo(claims.r),
    };
  }

  /** Exchange the authorization code (with the PKCE verifier) and verify the ID token. */
  async exchange(code: string, flow: VerifiedFlow, redirectUri: string): Promise<OidcIdentity> {
    this.assertConfigured();
    const res = await this.httpFetch(this.endpoints().tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId() as string,
        client_secret: this.clientSecret() as string,
        code_verifier: flow.verifier,
      }).toString(),
    });
    if (!res.ok) throw new UnauthenticatedError("Google sign-in failed");
    const body = (await res.json()) as { id_token?: unknown };
    if (typeof body.id_token !== "string") {
      throw new UnauthenticatedError("Google sign-in failed");
    }
    return this.verify(body.id_token, flow.nonce);
  }

  /** Verify an ID token, refetching the JWKS once if its `kid` is unknown (key rotation). */
  private async verify(idToken: string, nonce: string): Promise<OidcIdentity> {
    const opts = {
      clientId: this.clientId() as string,
      nonce,
      nowSeconds: Math.floor(Date.now() / 1000),
    };
    try {
      return verifyIdToken(idToken, { ...opts, keys: await this.keys(false) });
    } catch (err) {
      if (!(err instanceof IdTokenError)) throw err;
      if (err.message !== "unknown kid") {
        throw new UnauthenticatedError("Google ID token rejected");
      }
    }
    try {
      return verifyIdToken(idToken, { ...opts, keys: await this.keys(true) });
    } catch (err) {
      if (err instanceof IdTokenError) throw new UnauthenticatedError("Google ID token rejected");
      throw err;
    }
  }

  private async keys(force: boolean): Promise<Jwk[]> {
    if (!force && this.jwks && Date.now() - this.jwks.fetchedAt < JWKS_TTL_MS) {
      return this.jwks.keys;
    }
    const res = await this.httpFetch(this.endpoints().jwksUri, { method: "GET" });
    if (!res.ok) throw new UnauthenticatedError("Google sign-in failed");
    const body = (await res.json()) as { keys?: unknown };
    const keys = Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
    this.jwks = { keys, fetchedAt: Date.now() };
    return keys;
  }

  /** Network seam — Google's endpoints. Unit specs stub this. */
  protected httpFetch(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  /** HS256 key for `state` + the flow cookie, derived so it differs from the access-token key. */
  private flowSecret(): string {
    return createHmac("sha256", this.config.getOrThrow<string>("JWT_ACCESS_SECRET"))
      .update("erp-oidc-flow-v1")
      .digest("hex");
  }

  private clientId(): string | undefined {
    return this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID") || undefined;
  }

  private clientSecret(): string | undefined {
    return this.config.get<string>("GOOGLE_OAUTH_CLIENT_SECRET") || undefined;
  }
}
