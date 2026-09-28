import type { ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import type { Db } from "@erp/db";
import type { PasswordService } from "../auth/password.service.js";
import { PLATFORM_AUDIENCE } from "../auth/token.service.js";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import type { PlatformAuditEntry, PlatformAuditService } from "./platform-audit.service.js";
import { PLATFORM_REFRESH_AUDIENCE, PlatformAuthService } from "./platform-auth.service.js";
import { PlatformJwtGuard } from "./platform-jwt.guard.js";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";

const values: Record<string, string> = {
  JWT_ACCESS_SECRET: "test-access-secret",
  JWT_REFRESH_TTL: "7d",
  JWT_PLATFORM_SECRET: "test-platform-secret",
  JWT_PLATFORM_TTL: "30m",
};
const config = {
  get: (key: string) => values[key],
  getOrThrow: (key: string) => values[key],
} as unknown as ConfigService;

/**
 * A drizzle stand-in: every query-builder method chains, and awaiting a chain resolves to the
 * next queued result. `ops` records which builder each query started from.
 */
function fakeDb(results: unknown[][]) {
  const ops: string[] = [];
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => void) => resolve(results.shift() ?? [])
            : () => chain(),
      },
    );
  const db = new Proxy(
    {},
    {
      get: (_target, prop) => () => {
        ops.push(String(prop));
        return chain();
      },
    },
  ) as unknown as Db;
  return { db, ops };
}

function service(results: unknown[][] = []) {
  const { db, ops } = fakeDb(results);
  const audits: PlatformAuditEntry[] = [];
  const auth = new PlatformAuthService(
    db,
    new JwtService({}),
    config,
    { verify: async (hash: string, pw: string) => hash === pw } as unknown as PasswordService,
    { withTransaction: (fn: () => unknown) => fn() } as unknown as UnitOfWork,
    { append: async (e: PlatformAuditEntry) => void audits.push(e) } as unknown as PlatformAuditService,
  );
  return { auth, ops, audits };
}

const sign = (claims: object, opts: { secret?: string; audience?: string } = {}) =>
  new JwtService({}).signAsync(claims, {
    secret: opts.secret ?? "test-platform-secret",
    expiresIn: "15m",
    ...(opts.audience ? { audience: opts.audience } : {}),
  });

const liveSession = (over: Record<string, unknown> = {}) => ({
  sessionId: SESSION_ID,
  sessionAdminId: ADMIN_ID,
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  id: ADMIN_ID,
  email: "ops@platform.local",
  status: "ACTIVE",
  lockedUntil: null,
  ...over,
});

// M8 task 3.1/3.3 — platform tokens are `{pid, sid}` under the platform audience, backed by a
// live `platform_session`; tenant tokens (and anything carrying `tid`/`sub`) never pass.
describe("PlatformAuthService", () => {
  it("logs in with {pid, sid} tokens (no tid, no sub), opening a session and auditing", async () => {
    const { auth, ops, audits } = service([
      [{ id: ADMIN_ID, status: "ACTIVE", passwordHash: "pw", failedLoginCount: 2, lockedUntil: null }],
      [], // reset the failure counter
      [{ id: SESSION_ID }], // insert platform_session
    ]);
    const pair = await auth.login("ops@platform.local", "pw");
    expect(pair.expires_in).toBe(1800);
    expect(ops).toEqual(["select", "update", "insert"]);

    const jwt = new JwtService({});
    const access = await jwt.verifyAsync(pair.access_token, {
      secret: "test-platform-secret",
      audience: PLATFORM_AUDIENCE,
    });
    expect(access).toMatchObject({ pid: ADMIN_ID, sid: expect.any(String) });
    expect(access).not.toHaveProperty("tid");
    expect(access).not.toHaveProperty("sub");
    const refresh = await jwt.verifyAsync(pair.refresh_token, {
      secret: "test-platform-secret",
      audience: PLATFORM_REFRESH_AUDIENCE,
    });
    expect(refresh.sid).toBe(access.sid);

    expect(audits).toEqual([
      expect.objectContaining({ action: "LOGIN", platformAdminId: ADMIN_ID, entityId: ADMIN_ID }),
    ]);
  });

  it("counts a bad password toward the lockout and refuses a locked account", async () => {
    const bad = service([
      [{ id: ADMIN_ID, status: "ACTIVE", passwordHash: "pw", failedLoginCount: 0, lockedUntil: null }],
      [],
    ]);
    await expect(bad.auth.login("ops@platform.local", "nope")).rejects.toThrow(/Invalid credentials/);
    expect(bad.ops).toEqual(["select", "update"]);

    const locked = service([
      [
        {
          id: ADMIN_ID,
          status: "ACTIVE",
          passwordHash: "pw",
          failedLoginCount: 5,
          lockedUntil: new Date(Date.now() + 60_000),
        },
      ],
    ]);
    await expect(locked.auth.login("ops@platform.local", "pw")).rejects.toThrow(/locked/);
  });

  it("authenticates a platform access token against its live session", async () => {
    const { auth } = service([[liveSession()]]);
    const token = await sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_AUDIENCE });
    await expect(auth.authenticate(token)).resolves.toEqual({
      id: ADMIN_ID,
      email: "ops@platform.local",
      sessionId: SESSION_ID,
    });
  });

  it.each([
    ["revoked (logged out)", { revokedAt: new Date() }],
    ["expired", { expiresAt: new Date(Date.now() - 1) }],
    ["owned by another admin", { sessionAdminId: SESSION_ID }],
    ["of a disabled admin", { status: "DISABLED" }],
    ["of a locked admin", { lockedUntil: new Date(Date.now() + 60_000) }],
  ])("rejects a token whose session is %s", async (_label, over) => {
    const { auth } = service([[liveSession(over)]]);
    const token = await sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_AUDIENCE });
    await expect(auth.authenticate(token)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it.each([
    [
      "a tenant access token",
      () => sign({ sub: ADMIN_ID, sid: TOKEN_ID, pv: 1, tid: TENANT_ID }, { secret: "test-access-secret" }),
    ],
    [
      "a tenant-shaped token signed with the platform secret",
      () => sign({ sub: ADMIN_ID, sid: TOKEN_ID, pv: 1, tid: TENANT_ID }),
    ],
    [
      "a platform-audience token carrying tid",
      () => sign({ pid: ADMIN_ID, sid: TOKEN_ID, tid: TENANT_ID }, { audience: PLATFORM_AUDIENCE }),
    ],
    [
      "a platform-audience token carrying sub",
      () => sign({ pid: ADMIN_ID, sid: TOKEN_ID, sub: ADMIN_ID }, { audience: PLATFORM_AUDIENCE }),
    ],
    [
      "a platform refresh token",
      () => sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_REFRESH_AUDIENCE }),
    ],
  ])("rejects %s before any lookup", async (_label, make) => {
    const { auth, ops } = service([[liveSession()]]);
    await expect(auth.authenticate(await make())).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(ops).toEqual([]);
  });

  it("refreshes on a live session without rotating the refresh token", async () => {
    const { auth } = service([[liveSession()]]);
    const refresh = await sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_REFRESH_AUDIENCE });
    const pair = await auth.refresh(refresh);
    expect(pair.refresh_token).toBe(refresh);
    const claims = await new JwtService({}).verifyAsync(pair.access_token, {
      secret: "test-platform-secret",
      audience: PLATFORM_AUDIENCE,
    });
    expect(claims).toMatchObject({ pid: ADMIN_ID, sid: TOKEN_ID });

    const revoked = service([[liveSession({ revokedAt: new Date() })]]);
    await expect(revoked.auth.refresh(refresh)).rejects.toBeInstanceOf(UnauthenticatedError);
    // An access token is not a refresh token.
    const access = await sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_AUDIENCE });
    await expect(service().auth.refresh(access)).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("logout revokes the session and audits it once", async () => {
    const principal = { id: ADMIN_ID, email: "ops@platform.local", sessionId: SESSION_ID };
    const first = service([[{ id: SESSION_ID }]]);
    await first.auth.logout(principal);
    expect(first.ops).toEqual(["update"]);
    expect(first.audits).toEqual([
      expect.objectContaining({ action: "LOGOUT", platformAdminId: ADMIN_ID }),
    ]);

    // Already revoked — no second audit row.
    const again = service([[]]);
    await again.auth.logout(principal);
    expect(again.audits).toEqual([]);
  });
});

describe("PlatformJwtGuard", () => {
  const contextWith = (authorization?: string) => {
    const request: { headers: { authorization?: string }; platformAdmin?: unknown } = {
      headers: authorization ? { authorization } : {},
    };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { ctx, request };
  };

  it("attaches the authenticated platform admin", async () => {
    const { auth } = service([[liveSession()]]);
    const token = await sign({ pid: ADMIN_ID, sid: TOKEN_ID }, { audience: PLATFORM_AUDIENCE });
    const { ctx, request } = contextWith(`Bearer ${token}`);
    await expect(new PlatformJwtGuard(auth).canActivate(ctx)).resolves.toBe(true);
    expect(request.platformAdmin).toMatchObject({ id: ADMIN_ID, sessionId: SESSION_ID });
  });

  it("rejects a tenant token and a missing header with 401", async () => {
    const guard = new PlatformJwtGuard(service([[liveSession()]]).auth);
    const tenant = await sign(
      { sub: ADMIN_ID, sid: TOKEN_ID, pv: 1, tid: TENANT_ID },
      { secret: "test-access-secret" },
    );
    await expect(guard.canActivate(contextWith(`Bearer ${tenant}`).ctx)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(guard.canActivate(contextWith().ctx)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
