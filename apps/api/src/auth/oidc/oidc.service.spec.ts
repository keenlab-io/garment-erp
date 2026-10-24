import { generateKeyPairSync, sign } from "node:crypto";
import { JwtService } from "@nestjs/jwt";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BusinessRuleError,
  UnauthenticatedError,
} from "../../common/errors/app-exception.js";
import { pkceChallenge, type Jwk } from "./google-oidc.js";
import { OidcService, type OidcBinding } from "./oidc.service.js";

const CLIENT_ID = "client-123";
const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";
const REDIRECT = "https://a.example/api/v1/auth/oidc/google/callback";
const bindingA: OidcBinding = { mode: "TENANT", tenantId: TENANT_A, host: "a.example" };

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk: Jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid: "k1" };

function configWith(values: Record<string, string | undefined>): ConfigService {
  const all: Record<string, string | undefined> = { JWT_ACCESS_SECRET: "access-secret", ...values };
  return {
    get: (key: string) => all[key],
    getOrThrow: (key: string) => {
      const v = all[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    },
  } as unknown as ConfigService;
}

const configured = configWith({
  GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
});

/** OidcService with Google's endpoints stubbed; records every outbound call. */
class StubbedOidc extends OidcService {
  calls: Array<{ url: string; body?: string }> = [];
  idToken = "";

  protected override async httpFetch(url: string, init: RequestInit): Promise<Response> {
    this.calls.push({ url, body: init.body as string | undefined });
    if (url.includes("token")) return Response.json({ id_token: this.idToken });
    return Response.json({ keys: [jwk] });
  }
}

function makeIdToken(nonce: string): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc({ alg: "RS256", kid: "k1" })}.${enc({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce,
    sub: "sub-1",
    email: "g@gmail.com",
    email_verified: true,
  })}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

describe("OidcService", () => {
  it("refuses (uniform envelope, no URL) when the OAuth client is unset", async () => {
    const svc = new OidcService(configWith({}), new JwtService({}));
    expect(svc.isConfigured()).toBe(false);
    await expect(svc.start(bindingA, REDIRECT, undefined)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
  });

  it("builds a PKCE S256 authorize URL whose state verifies against the flow cookie", async () => {
    const svc = new OidcService(configured, new JwtService({}));
    const { url, flowCookie } = await svc.start(bindingA, REDIRECT, "/sales/invoices");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(u.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    // The verifier is never in the URL Google sees — only its challenge.
    expect(url).not.toContain(flowCookie);

    const flow = await svc.verifyFlow(u.searchParams.get("state") ?? "", flowCookie, bindingA);
    expect(flow.binding).toEqual(bindingA);
    expect(flow.nonce).toBe(u.searchParams.get("nonce"));
    expect(flow.returnTo).toBe("/sales/invoices");
    expect(pkceChallenge(flow.verifier)).toBe(u.searchParams.get("code_challenge"));
  });

  it("rejects a cross-tenant replay, a tampered state, a missing or foreign flow cookie", async () => {
    const svc = new OidcService(configured, new JwtService({}));
    const a = await svc.start(bindingA, REDIRECT, undefined);
    const other = await svc.start(bindingA, REDIRECT, undefined);
    const state = new URL(a.url).searchParams.get("state") ?? "";

    await expect(
      svc.verifyFlow(state, a.flowCookie, { ...bindingA, tenantId: TENANT_B }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(
      svc.verifyFlow(state, a.flowCookie, { ...bindingA, mode: "DEMO_POOL" }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(svc.verifyFlow(`${state}x`, a.flowCookie, bindingA)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(svc.verifyFlow(state, undefined, bindingA)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(svc.verifyFlow(state, other.flowCookie, bindingA)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects an expired state (flow older than its TTL)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const svc = new OidcService(configured, new JwtService({}));
    const { url, flowCookie } = await svc.start(bindingA, REDIRECT, undefined);
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await expect(
      svc.verifyFlow(new URL(url).searchParams.get("state") ?? "", flowCookie, bindingA),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("rejects a state signed with a different secret (forged)", async () => {
    const forger = new OidcService(
      configWith({
        GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
        JWT_ACCESS_SECRET: "attacker",
      }),
      new JwtService({}),
    );
    const forged = await forger.start(bindingA, REDIRECT, undefined);
    const svc = new OidcService(configured, new JwtService({}));
    await expect(
      svc.verifyFlow(new URL(forged.url).searchParams.get("state") ?? "", forged.flowCookie, bindingA),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("exchanges the code with the PKCE verifier and verifies the ID token via JWKS", async () => {
    const svc = new StubbedOidc(configured, new JwtService({}));
    const { url, flowCookie } = await svc.start(bindingA, REDIRECT, undefined);
    const flow = await svc.verifyFlow(new URL(url).searchParams.get("state") ?? "", flowCookie, bindingA);
    svc.idToken = makeIdToken(flow.nonce);

    const identity = await svc.exchange("auth-code", flow, REDIRECT);
    expect(identity).toMatchObject({ sub: "sub-1", email: "g@gmail.com", email_verified: true });

    const tokenCall = svc.calls.find((c) => c.url.includes("token"));
    const form = new URLSearchParams(tokenCall?.body ?? "");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("code_verifier")).toBe(flow.verifier);
    expect(form.get("redirect_uri")).toBe(REDIRECT);
  });

  it("rejects an ID token whose nonce is not this flow's", async () => {
    const svc = new StubbedOidc(configured, new JwtService({}));
    const { url, flowCookie } = await svc.start(bindingA, REDIRECT, undefined);
    const flow = await svc.verifyFlow(new URL(url).searchParams.get("state") ?? "", flowCookie, bindingA);
    svc.idToken = makeIdToken("someone-elses-nonce");
    await expect(svc.exchange("auth-code", flow, REDIRECT)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});
