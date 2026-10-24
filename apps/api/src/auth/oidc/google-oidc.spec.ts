import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  IdTokenError,
  pkceChallenge,
  safeReturnTo,
  verifyIdToken,
  type Jwk,
} from "./google-oidc.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";
const keys: Jwk[] = [{ ...(publicKey.export({ format: "jwk" }) as Jwk), kid: KID, alg: "RS256" }];
const CLIENT_ID = "client-123.apps.googleusercontent.com";
const NOW = 1_800_000_000;

function idToken(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: KID },
): string {
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${enc(header)}.${enc(claims)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: NOW + 300,
  iat: NOW,
  nonce: "n-1",
  sub: "google-sub-1",
  email: "guest@gmail.com",
  email_verified: true,
  name: "Guest",
};
const opts = { keys, clientId: CLIENT_ID, nonce: "n-1", nowSeconds: NOW };

describe("verifyIdToken", () => {
  it("returns the identity for a valid, correctly-signed token", () => {
    expect(verifyIdToken(idToken(good), opts)).toEqual({
      sub: "google-sub-1",
      email: "guest@gmail.com",
      email_verified: true,
      name: "Guest",
    });
  });

  it("accepts the bare `accounts.google.com` issuer", () => {
    expect(verifyIdToken(idToken({ ...good, iss: "accounts.google.com" }), opts).sub).toBe(
      "google-sub-1",
    );
  });

  it.each([
    ["wrong issuer", { ...good, iss: "https://evil.example" }],
    ["wrong audience", { ...good, aud: "someone-else" }],
    ["expired", { ...good, exp: NOW - 120 }],
    ["wrong nonce", { ...good, nonce: "other" }],
    ["missing sub", { ...good, sub: "" }],
    ["aud list without matching azp", { ...good, aud: [CLIENT_ID, "x"], azp: "x" }],
  ])("rejects a token with %s", (_label, claims) => {
    expect(() => verifyIdToken(idToken(claims), opts)).toThrow(IdTokenError);
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const [h, , s] = idToken(good).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, sub: "attacker" })).toString("base64url");
    expect(() => verifyIdToken(`${h}.${forged}.${s}`, opts)).toThrow(IdTokenError);
  });

  it("rejects an unknown kid and a non-RS256 alg", () => {
    expect(() => verifyIdToken(idToken(good, { alg: "RS256", kid: "nope" }), opts)).toThrow(
      "unknown kid",
    );
    expect(() => verifyIdToken(idToken(good, { alg: "none", kid: KID }), opts)).toThrow(
      IdTokenError,
    );
  });

  it("reports an unverified email as such", () => {
    expect(verifyIdToken(idToken({ ...good, email_verified: false }), opts).email_verified).toBe(
      false,
    );
  });
});

describe("pkceChallenge", () => {
  it("is the base64url SHA-256 of the verifier (RFC 7636 S256)", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallenge(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
    // RFC 7636 Appendix B test vector.
    expect(pkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("safeReturnTo", () => {
  it.each([
    [undefined, "/"],
    ["/production/orders?x=1", "/production/orders?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/a\nb", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});
