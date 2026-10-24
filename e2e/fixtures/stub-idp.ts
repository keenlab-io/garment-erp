import { createServer, type Server } from "node:http";
import { createSign, generateKeyPairSync, randomUUID, type JsonWebKey } from "node:crypto";

/**
 * A stand-in Google OIDC provider for the demo flow (M10 §7.9). The api is booted with
 * `GOOGLE_OIDC_BASE_URL=<this server>` and `GOOGLE_OAUTH_CLIENT_ID/SECRET`, so its code flow talks
 * to `/authorize` (auto-approves, redirecting straight back), `/token` (returns an RS256 ID token
 * echoing the authorize request's nonce) and `/jwks`. A fresh `sub` per sign-in, so every guest
 * is a first-time guest unless the test reuses one via `nextIdentity`.
 */
export interface StubIdp {
  baseUrl: string;
  /** Make the next `/authorize` sign in as this identity (otherwise a random one). */
  nextIdentity(identity: { sub: string; email: string; name?: string }): void;
  close(): Promise<void>;
}

const b64u = (v: Buffer | string): string => Buffer.from(v).toString("base64url");

export async function startStubIdp(opts: { port: number; clientId: string }): Promise<StubIdp> {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "stub-idp-key";
  const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid, alg: "RS256", use: "sig" };
  const baseUrl = `http://localhost:${opts.port}`;

  const codes = new Map<string, { nonce: string; sub: string; email: string; name: string }>();
  let queued: { sub: string; email: string; name?: string } | null = null;

  const sign = (claims: Record<string, unknown>): string => {
    const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
    const body = b64u(JSON.stringify(claims));
    const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
    return `${head}.${body}.${b64u(sig)}`;
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", baseUrl);
    if (url.pathname === "/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (!redirectUri || !state) {
        res.writeHead(400).end("missing redirect_uri/state");
        return;
      }
      const id = queued ?? { sub: `stub-${randomUUID()}`, email: `guest-${randomUUID().slice(0, 8)}@example.com` };
      queued = null;
      const code = randomUUID();
      codes.set(code, {
        nonce: url.searchParams.get("nonce") ?? "",
        sub: id.sub,
        email: id.email,
        name: id.name ?? "คุณทดสอบ ใจดี",
      });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", state);
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }
    if (url.pathname === "/token" && req.method === "POST") {
      let raw = "";
      req.on("data", (c: Buffer) => (raw += c.toString()));
      req.on("end", () => {
        const code = new URLSearchParams(raw).get("code") ?? "";
        const grant = codes.get(code);
        codes.delete(code);
        if (!grant) {
          res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        const idToken = sign({
          iss: "https://accounts.google.com",
          aud: opts.clientId,
          sub: grant.sub,
          email: grant.email,
          email_verified: true,
          name: grant.name,
          nonce: grant.nonce,
          iat: now,
          exp: now + 300,
        });
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ id_token: idToken, access_token: "stub", token_type: "Bearer" }));
      });
      return;
    }
    if (url.pathname === "/jwks") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(opts.port, resolve));

  return {
    baseUrl,
    nextIdentity: (identity) => {
      queued = identity;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
