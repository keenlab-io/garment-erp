import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where the ambient tenant came from (M7 design D4): the verified `tid` claim, the
 * pre-login hostname, a queue job's payload, or a platform/system operation (provisioning).
 */
export type TenantSource = "jwt" | "host" | "job" | "system";

/**
 * A platform support session acting inside the tenant (M7 design D6) — carried alongside the
 * tenant so the audit path can dual-write into `platform_audit_log` without request access.
 */
export interface SupportScope {
  supportSessionId: string;
  platformAdminId: string;
}

/** The tenant acting in the current async call tree. */
export interface TenantStore {
  tenantId: string;
  source: TenantSource;
  /** Set when the request authenticated with a support-session token (`sup` claim). */
  support?: SupportScope;
  /**
   * The tenant's resolved feature map (M8 design D2), filled lazily by `EntitlementsService` so
   * entitlement resolution runs at most once per request/job — the store lives exactly that long.
   */
  features?: Readonly<Record<string, boolean>>;
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

/**
 * A per-request slot the hostname middleware opens around every HTTP request, which `JwtGuard`
 * fills from the verified `tid` claim (`enterTenant`). Needed because the guard is *awaited* by
 * Nest: `AsyncLocalStorage.enterWith` inside it does not flow back to the caller's continuation
 * under AsyncContextFrame (the Node ≥ 24 default), so the interceptors and handler would lose
 * the tenant. Mutating a frame opened *above* the guard survives either ALS implementation.
 */
interface TenantSlot {
  store?: TenantStore;
}
const tenantSlot = new AsyncLocalStorage<TenantSlot>();

/** The tenant in scope, or `null` outside any tenant context. */
export const currentTenantId = (): string | null => currentTenant()?.tenantId ?? null;

/**
 * The full tenant store in scope (id + source), or `undefined`. An explicit `tenantContext`
 * frame (`runWithTenant`, the host middleware) shadows the request slot.
 */
export const currentTenant = (): TenantStore | undefined =>
  tenantContext.getStore() ?? tenantSlot.getStore()?.store;

/** The support session acting in the current tenant scope, or `undefined` for ordinary users. */
export const currentSupportScope = (): SupportScope | undefined => currentTenant()?.support;

/** Run `fn` (the rest of an HTTP request) with an empty tenant slot open for `enterTenant`. */
export function openTenantSlot<T>(fn: () => T): T {
  return tenantSlot.run({}, fn);
}

/**
 * Enter `tenantId` for the remainder of the current request — the imperative counterpart of
 * `runWithTenant` for an entry point that cannot wrap its continuation (`JwtGuard`). Fills the
 * request slot when one is open; otherwise falls back to `tenantContext.enterWith`.
 */
export function enterTenant(
  tenantId: string,
  source: TenantSource,
  support?: SupportScope,
): void {
  if (!isTenantId(tenantId)) {
    throw new Error(`Refusing to enter tenant context: "${tenantId}" is not a uuid`);
  }
  const store: TenantStore = support ? { tenantId, source, support } : { tenantId, source };
  const slot = tenantSlot.getStore();
  if (slot) slot.store = store;
  else tenantContext.enterWith(store);
}

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
