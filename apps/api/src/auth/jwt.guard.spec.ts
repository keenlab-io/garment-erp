import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it } from "vitest";
import type { Permission } from "@erp/contracts";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import { JwtGuard } from "./jwt.guard.js";
import { TokenService } from "./token.service.js";
import type {
  AuthSessionRecord,
  AuthUserRecord,
  PermissionResolver,
  SessionLookup,
  UserLookup,
} from "./auth.tokens.js";

// Unit test for the global `JwtGuard` — the instant-revocation loop that spec §1.8
// (issue #11, task 4.1) pins as "role change ⇒ next request 401". A live access
// token carries a `pv` snapshot; once a bound user's role changes and their
// `permissionsVersion` is bumped, the *same* token must be rejected on the very next
// request. Real JWT sign/verify + stub lookups isolate the guard from the DB.

const config = {
  getOrThrow: (key: string) =>
    ({
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "7d",
    })[key],
} as unknown as ConfigService;

/** A minimal `ExecutionContext` carrying an `Authorization` header. */
function contextWith(authorization: string | undefined): {
  ctx: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: authorization === undefined ? {} : { authorization },
  };
  const ctx = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe("JwtGuard (instant revocation)", () => {
  const tokens = new TokenService(new JwtService({}), config);
  // A never-public reflector: every request runs the full auth loop.
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

  const USER_ID = "11111111-1111-1111-1111-111111111111";
  const SESSION_ID = "22222222-2222-2222-2222-222222222222";
  const TOKEN_ID = "33333333-3333-3333-3333-333333333333";

  let userRecord: AuthUserRecord;
  let sessionRecord: AuthSessionRecord;
  let resolved: ReadonlySet<Permission>;

  const users: UserLookup = { byId: async () => userRecord };
  const sessions: SessionLookup = { byTokenId: async () => sessionRecord };
  const resolver: PermissionResolver = { resolve: async () => resolved };

  const guard = new JwtGuard(reflector, tokens, users, sessions, resolver);

  /** Sign an access token snapshotting `pv`. */
  function tokenAt(pv: number): Promise<string> {
    return tokens.signAccess({ sub: USER_ID, sid: TOKEN_ID, pv });
  }

  beforeEach(() => {
    userRecord = {
      id: USER_ID,
      status: "ACTIVE",
      permissionsVersion: 1,
      isSuperAdmin: false,
      lockedUntil: null,
    };
    sessionRecord = {
      id: SESSION_ID,
      userId: USER_ID,
      tokenId: TOKEN_ID,
      permissionsVersion: 1,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    resolved = new Set<Permission>(["iam.user.manage"]);
  });

  it("admits a request whose token pv still matches the user", async () => {
    const token = await tokenAt(1);
    const { ctx, request } = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((request.user as { id: string }).id).toBe(USER_ID);
    expect((request.user as { permissions: Set<Permission> }).permissions).toEqual(
      new Set(["iam.user.manage"]),
    );
  });

  it("rejects with 401 once the user's permissions_version is bumped (role change)", async () => {
    // The token was minted at pv=1; a role change bumped the user to pv=2.
    const token = await tokenAt(1);
    userRecord.permissionsVersion = 2;
    const { ctx, request } = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(request.user).toBeUndefined();

    // Re-login mints a token at the new pv; that one is admitted again.
    const fresh = await tokenAt(2);
    const next = contextWith(`Bearer ${fresh}`);
    await expect(guard.canActivate(next.ctx)).resolves.toBe(true);
  });

  it("rejects a revoked session (force-logout) with 401", async () => {
    const token = await tokenAt(1);
    sessionRecord.revokedAt = new Date();
    const { ctx } = contextWith(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects a non-ACTIVE user with 401", async () => {
    const token = await tokenAt(1);
    userRecord.status = "DISABLED";
    const { ctx } = contextWith(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("rejects a missing or non-bearer Authorization header with 401", async () => {
    await expect(
      guard.canActivate(contextWith(undefined).ctx),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(
      guard.canActivate(contextWith("Basic abc").ctx),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
