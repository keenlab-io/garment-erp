import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it } from "vitest";
import type { Permission } from "@erp/contracts";
import { UnauthenticatedError } from "../common/errors/app-exception.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import { currentTenant, currentTenantId, openTenantSlot } from "../tenancy/tenant-context.js";
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
  const TENANT_A = "00000000-0000-4000-8000-00000000000a";
  const TENANT_B = "00000000-0000-4000-8000-00000000000b";

  let userRecord: AuthUserRecord;
  let sessionRecord: AuthSessionRecord;
  let resolved: ReadonlySet<Permission>;
  // The tenant in scope at each lookup, and how many auth transactions were opened.
  let lookupTenants: (string | null)[];
  let transactions: number;

  const users: UserLookup = {
    byId: async () => {
      lookupTenants.push(currentTenantId());
      return userRecord;
    },
  };
  const sessions: SessionLookup = {
    byTokenId: async () => {
      lookupTenants.push(currentTenantId());
      return sessionRecord;
    },
  };
  const resolver: PermissionResolver = { resolve: async () => resolved };
  const uow = {
    withTransaction: async <T>(fn: () => Promise<T>) => {
      transactions++;
      return fn();
    },
  } as unknown as UnitOfWork;

  const guard = new JwtGuard(reflector, tokens, users, sessions, resolver, uow);

  /** Sign an access token snapshotting `pv` for tenant A. */
  function tokenAt(pv: number): Promise<string> {
    return tokens.signAccess({ sub: USER_ID, sid: TOKEN_ID, pv, tid: TENANT_A });
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
      tenantId: TENANT_A,
      tokenId: TOKEN_ID,
      permissionsVersion: 1,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    };
    resolved = new Set<Permission>(["iam.user.manage"]);
    lookupTenants = [];
    transactions = 0;
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

  it("enters the token's tenant and runs the lookups in one tenant transaction", async () => {
    const token = await tokenAt(1);
    const { ctx, request } = contextWith(`Bearer ${token}`);

    const after = await openTenantSlot(async () => {
      await guard.canActivate(ctx);
      return currentTenant();
    });
    expect(after).toEqual({ tenantId: TENANT_A, source: "jwt" });
    expect(lookupTenants).toEqual([TENANT_A, TENANT_A]);
    expect(transactions).toBe(1);
    expect((request.user as { tenantId: string }).tenantId).toBe(TENANT_A);
    expect(request.user).not.toHaveProperty("supportSessionId");
  });

  it("rejects with 401 when the session belongs to another tenant than the token's tid", async () => {
    const token = await tokenAt(1);
    sessionRecord.tenantId = TENANT_B;
    const { ctx, request } = contextWith(`Bearer ${token}`);
    await expect(openTenantSlot(() => guard.canActivate(ctx))).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(request.user).toBeUndefined();
  });

  it("rejects a token without a well-formed tid claim before any lookup", async () => {
    const legacy = await new JwtService({}).signAsync(
      { sub: USER_ID, sid: TOKEN_ID, pv: 1 },
      { secret: "test-access-secret", expiresIn: "15m" },
    );
    await expect(
      openTenantSlot(() => guard.canActivate(contextWith(`Bearer ${legacy}`).ctx)),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(lookupTenants).toEqual([]);
  });

  it("carries a support-session claim onto the AuthUser", async () => {
    const token = await tokens.signAccess({
      sub: USER_ID,
      sid: TOKEN_ID,
      pv: 1,
      tid: TENANT_A,
      sup: "44444444-4444-4444-4444-444444444444",
    });
    const { ctx, request } = contextWith(`Bearer ${token}`);
    await openTenantSlot(() => guard.canActivate(ctx));
    expect((request.user as { supportSessionId?: string }).supportSessionId).toBe(
      "44444444-4444-4444-4444-444444444444",
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
