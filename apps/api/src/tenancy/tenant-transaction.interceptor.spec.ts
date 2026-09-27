import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator.js";
import type { UnitOfWork } from "../db/unit-of-work.service.js";
import { SKIP_TENANT_TRANSACTION_KEY } from "./skip-tenant-transaction.decorator.js";
import { runWithTenant } from "./tenant-context.js";
import { TenantTransactionInterceptor } from "./tenant-transaction.interceptor.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";

function setup(metadata: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const uow = {
    withTransaction: async <T>(fn: () => Promise<T>) => {
      calls.push("begin");
      const result = await fn();
      calls.push("commit");
      return result;
    },
  } as unknown as UnitOfWork;
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key] ?? false,
  } as unknown as Reflector;
  const context = {
    getType: () => "http",
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
  const next: CallHandler = {
    handle: () => {
      calls.push("handler");
      return of({ ok: true });
    },
  };
  return { interceptor: new TenantTransactionInterceptor(reflector, uow), context, next, calls };
}

describe("TenantTransactionInterceptor", () => {
  it("runs a tenant-scoped handler inside one transaction", async () => {
    const { interceptor, context, next, calls } = setup();
    const body = await runWithTenant(TENANT, "jwt", () =>
      lastValueFrom(interceptor.intercept(context, next)),
    );
    expect(body).toEqual({ ok: true });
    expect(calls).toEqual(["begin", "handler", "commit"]);
  });

  it("passes through when no tenant is in scope", async () => {
    const { interceptor, context, next, calls } = setup();
    await lastValueFrom(interceptor.intercept(context, next));
    expect(calls).toEqual(["handler"]);
  });

  it.each([IS_PUBLIC_KEY, SKIP_TENANT_TRANSACTION_KEY])("passes through when %s is set", async (key) => {
    const { interceptor, context, next, calls } = setup({ [key]: true });
    await runWithTenant(TENANT, "host", () => lastValueFrom(interceptor.intercept(context, next)));
    expect(calls).toEqual(["handler"]);
  });
});
