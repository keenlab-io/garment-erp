import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where the ambient tenant came from (M7 design D4): the verified `tid` claim, the
 * pre-login hostname, a queue job's payload, or a platform/system operation (provisioning).
 */
export type TenantSource = "jwt" | "host" | "job" | "system";

/** The tenant acting in the current async call tree. */
export interface TenantStore {
  tenantId: string;
  source: TenantSource;
}

/**
 * Tenant scope, deliberately separate from `txContext` (design D4): it outlives any single
 * transaction — one request runs an auth-lookup tx then a handler tx, one job runs many — so
 * it is entered once per entry point (JwtGuard, hostname middleware, `withTenantJob`, socket
 * handshake) and every `UnitOfWork.withTransaction` opened inside it sets `app.tenant_id`.
 */
export const tenantContext = new AsyncLocalStorage<TenantStore>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is `value` a well-formed uuid — the only shape a tenant id may take before it reaches SQL. */
export const isTenantId = (value: unknown): value is string =>
  typeof value === "string" && UUID_RE.test(value);

/** The tenant in scope, or `null` outside any tenant context. */
export const currentTenantId = (): string | null => tenantContext.getStore()?.tenantId ?? null;

/** The full tenant store in scope (id + source), or `undefined`. */
export const currentTenant = (): TenantStore | undefined => tenantContext.getStore();

/**
 * Run `fn` with `tenantId` in scope. Validates the id up front so a malformed value can never
 * be entered into the context (and from there into the `app.tenant_id` GUC).
 */
export function runWithTenant<T>(tenantId: string, source: TenantSource, fn: () => T): T {
  if (!isTenantId(tenantId)) {
    throw new Error(`Refusing to enter tenant context: "${tenantId}" is not a uuid`);
  }
  return tenantContext.run({ tenantId, source }, fn);
}
