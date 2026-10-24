import { describe, expect, it, vi } from "vitest";
import type { Db } from "@erp/db";
import type { TokenPair } from "@erp/contracts";
import { ForbiddenError } from "../../common/errors/app-exception.js";
import type { UnitOfWork } from "../../db/unit-of-work.service.js";
import type { AuthService } from "../../iam/auth.service.js";
import type { EntitlementsService } from "../../platform/entitlements.service.js";
import type { DemoProvisioner } from "./demo-provisioner.js";
import type { OidcIdentity } from "./google-oidc.js";
import { OidcLoginService } from "./oidc-login.service.js";
import type { OidcBinding } from "./oidc.service.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const SANDBOX = "00000000-0000-4000-8000-00000000005b";
const tenantBinding: OidcBinding = { mode: "TENANT", tenantId: TENANT, host: "a.example" };
const poolBinding: OidcBinding = { mode: "DEMO_POOL", tenantId: TENANT, host: "demo.example" };
const identity: OidcIdentity = {
  sub: "sub-1",
  email: "g@gmail.com",
  email_verified: true,
  name: "Guest",
};
const pair: TokenPair = { access_token: "a", refresh_token: "r", expires_in: 900 };
const ctx = { ip: "203.0.113.9" };

/** A drizzle-ish select chain resolving to `rows` at `.limit()`. */
function dbReturning(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "where", "orderBy"]) chain[m] = () => chain;
  chain.limit = async () => rows;
  return chain as unknown as Db;
}

const uow = { withTransaction: <T>(fn: () => T) => fn() } as unknown as UnitOfWork;

function setup(opts: {
  rows?: unknown[];
  features?: Record<string, boolean>;
  existing?: TokenPair | null;
  provisioner?: DemoProvisioner;
}) {
  const auth = {
    signInWithIdentity: vi.fn(async () => opts.existing ?? null),
    signUpWithGoogle: vi.fn(async () => pair),
  };
  const entitlements = { resolve: vi.fn(async () => opts.features ?? {}) };
  const svc = new OidcLoginService(
    dbReturning(opts.rows ?? []),
    uow,
    auth as unknown as AuthService,
    entitlements as unknown as EntitlementsService,
    opts.provisioner,
  );
  return { svc, auth, entitlements };
}

describe("OidcLoginService.assertGoogleEnabled", () => {
  it("refuses a tenant without the auth.google feature", async () => {
    const { svc } = setup({ features: {} });
    await expect(svc.assertGoogleEnabled(tenantBinding)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows a tenant with auth.google on, and the demo pool unconditionally", async () => {
    const { svc, entitlements } = setup({ features: { "auth.google": true } });
    await expect(svc.assertGoogleEnabled(tenantBinding)).resolves.toBeUndefined();
    await expect(svc.assertGoogleEnabled(poolBinding)).resolves.toBeUndefined();
    expect(entitlements.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("OidcLoginService.signIn — TENANT host", () => {
  it("signs a known identity in through AuthService", async () => {
    const { svc, auth } = setup({ existing: pair });
    await expect(svc.signIn(tenantBinding, identity, ctx)).resolves.toEqual({
      tokens: pair,
      demo: false,
    });
    expect(auth.signInWithIdentity).toHaveBeenCalledWith(TENANT, "GOOGLE", "sub-1");
    expect(auth.signUpWithGoogle).not.toHaveBeenCalled();
  });

  it("hands an unknown identity to the allow_self_signup-gated signup", async () => {
    const { svc, auth } = setup({ existing: null });
    await svc.signIn(tenantBinding, identity, ctx);
    expect(auth.signUpWithGoogle).toHaveBeenCalledWith(TENANT, {
      sub: "sub-1",
      email: "g@gmail.com",
      name: "Guest",
    });
  });

  it("refuses signup for an unverified email without creating anything", async () => {
    const { svc, auth } = setup({ existing: null });
    await expect(
      svc.signIn(tenantBinding, { ...identity, email_verified: false }, ctx),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(auth.signUpWithGoogle).not.toHaveBeenCalled();
  });
});

describe("OidcLoginService.signIn — DEMO_POOL host", () => {
  it("resumes the guest's live sandbox", async () => {
    const provisioner = { provision: vi.fn(async () => pair) };
    const { svc, auth } = setup({ rows: [{ tenantId: SANDBOX }], existing: pair, provisioner });
    await expect(svc.signIn(poolBinding, identity, ctx)).resolves.toEqual({
      tokens: pair,
      demo: true,
    });
    expect(auth.signInWithIdentity).toHaveBeenCalledWith(SANDBOX, "GOOGLE", "sub-1");
    expect(provisioner.provision).not.toHaveBeenCalled();
  });

  it("provisions a new sandbox when the guest has none", async () => {
    const provisioner = { provision: vi.fn(async () => pair) };
    const { svc } = setup({ rows: [], provisioner });
    await expect(svc.signIn(poolBinding, identity, ctx)).resolves.toEqual({
      tokens: pair,
      demo: true,
    });
    expect(provisioner.provision).toHaveBeenCalledWith(
      { sub: "sub-1", email: "g@gmail.com", name: "Guest" },
      ctx,
    );
  });

  it("refuses a new guest when no provisioner is bound, or the email is unverified", async () => {
    await expect(setup({ rows: [] }).svc.signIn(poolBinding, identity, ctx)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const provisioner = { provision: vi.fn(async () => pair) };
    await expect(
      setup({ rows: [], provisioner }).svc.signIn(
        poolBinding,
        { ...identity, email_verified: false },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(provisioner.provision).not.toHaveBeenCalled();
  });
});
