import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { warehouse } from "@erp/db";
import { inCallerTenant } from "./in-caller-tenant.js";
import { runWithTenant } from "./tenant-context.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const dialect = new PgDialect();
const render = (q: ReturnType<typeof inCallerTenant>) => dialect.sqlToQuery(q);

describe("inCallerTenant", () => {
  it("adds a tenant_id predicate inside a tenant scope", () => {
    const q = runWithTenant(TENANT, "jwt", () =>
      render(inCallerTenant(warehouse.tenantId, eq(warehouse.name, "Main"))),
    );
    expect(q.sql).toContain('"warehouse"."tenantId" = $1');
    expect(q.sql).toContain('"warehouse"."name" = $2');
    expect(q.params).toEqual([TENANT, "Main"]);
  });

  it("scopes a condition-less pick to the tenant", () => {
    const q = runWithTenant(TENANT, "jwt", () => render(inCallerTenant(warehouse.tenantId)));
    expect(q.sql).toContain('"warehouse"."tenantId" = $1');
    expect(q.params).toEqual([TENANT]);
  });

  it("leaves the condition to RLS outside a tenant scope", () => {
    expect(render(inCallerTenant(warehouse.tenantId, eq(warehouse.name, "Main"))).params).toEqual([
      "Main",
    ]);
    expect(render(inCallerTenant(warehouse.tenantId)).sql).toBe("true");
  });
});
