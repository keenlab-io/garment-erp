import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from "node:crypto";

/**
 * Google's OIDC endpoints (M10 design OQ1 — minimal fetch, no `openid-client`). Google's
 * discovery document (`https://accounts.google.com/.well-known/openid-configuration`) is stable,
 * so the three endpoints are pinned here rather than discovered at boot.
 */
export const GOOGLE_OIDC = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  jwksUri: "https://www.googleapis.com/oauth2/v3/certs",
  /** Google issues ID tokens with either spelling of its issuer. */
  issuers: ["https://accounts.google.com", "accounts.google.com"] as readonly string[],
} as const;

/** Clock skew tolerated on `exp`/`iat` (seconds). */
const CLOCK_SKEW_S = 60;

/** The verified identity the callback branches on. */
export interface OidcIdentity {
  sub: string;
  email: string | null;
  email_verified: boolean;
  name: string | null;
}

/** A public signing key from Google's JWKS. */
export type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string; kty?: string };

export const base64url = (buf: Buffer): string => buf.toString("base64url");

/** A fresh high-entropy random string (nonce, PKCE verifier, state id). */
export const randomToken = (bytes = 32): string => base64url(randomBytes(bytes));

/** PKCE S256 (RFC 7636): `code_challenge = BASE64URL(SHA256(code_verifier))`. */
export function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/** Thrown for any ID-token defect; the service maps it to 401 without leaking the reason. */
export class IdTokenError extends Error {}

interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  azp?: unknown;
  exp?: unknown;
  iat?: unknown;
  nonce?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

function decodeSegment<T>(segment: string | undefined): T {
  if (!segment) throw new IdTokenError("malformed token");
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    throw new IdTokenError("malformed token");
  }
}

/**
 * Verify a Google ID token: RS256 signature against the JWKS key named by `kid`, then
 * `iss` ∈ Google's issuers, `aud` = our client id (`azp` too when `aud` is a list), `exp` in the
 * future, and `nonce` equal to the one bound into this flow's `state`. Pure — the caller supplies
 * the key set and the clock, so it is unit-testable without network.
 */
export function verifyIdToken(
  idToken: string,
  opts: { keys: readonly Jwk[]; clientId: string; nonce: string; nowSeconds: number },
): OidcIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new IdTokenError("malformed token");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = decodeSegment<{ alg?: unknown; kid?: unknown }>(headerB64);
  if (header.alg !== "RS256") throw new IdTokenError("unexpected alg");
  const jwk = opts.keys.find((k) => k.kid === header.kid && (k.kty ?? "RSA") === "RSA");
  if (!jwk) throw new IdTokenError("unknown kid");

  let valid: boolean;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    valid = verify(
      "RSA-SHA256",
      Buffer.from(`${headerB64}.${payloadB64}`),
      key,
      Buffer.from(sigB64, "base64url"),
    );
  } catch {
    throw new IdTokenError("signature check failed");
  }
  if (!valid) throw new IdTokenError("bad signature");

  const claims = decodeSegment<IdTokenClaims>(payloadB64);
  if (typeof claims.iss !== "string" || !GOOGLE_OIDC.issuers.includes(claims.iss)) {
    throw new IdTokenError("bad iss");
  }
  const audOk = Array.isArray(claims.aud)
    ? claims.aud.includes(opts.clientId) && claims.azp === opts.clientId
    : claims.aud === opts.clientId;
  if (!audOk) throw new IdTokenError("bad aud");
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= opts.nowSeconds) {
    throw new IdTokenError("expired");
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > opts.nowSeconds) {
    throw new IdTokenError("issued in the future");
  }
  if (typeof claims.nonce !== "string" || claims.nonce !== opts.nonce) {
    throw new IdTokenError("bad nonce");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new IdTokenError("missing sub");
  }

  return {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    // Google sends a boolean; tolerate the legacy string form.
    email_verified: claims.email_verified === true || claims.email_verified === "true",
    name: typeof claims.name === "string" ? claims.name : null,
  };
}

/**
 * A same-origin path to land on after sign-in, or `/`. Anything absolute, protocol-relative
 * (`//evil`), or backslash-smuggled is dropped — `return_to` must never become an open redirect.
 */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/";
  }
  return [...value].some((ch) => ch.charCodeAt(0) < 0x20) ? "/" : value;
}
