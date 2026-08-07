/**
 * Which half of the deployment this process is (`APP_ROLE`). The api image is built once and
 * run twice in k8s: `erp-api` pods serve HTTP + Socket.IO, `erp-worker` pods drain the BullMQ
 * queues. Splitting them keeps a Chromium PDF render or a payroll run from competing with
 * request serving for CPU/memory, and lets `erp-api` scale horizontally while `erp-worker`
 * stays at one replica.
 *
 * `all` (the default) is the single-process behaviour every dev machine and every test has
 * always had — this seam is additive, so nothing changes unless `APP_ROLE` is set.
 *
 * IMPORTANT: this reads `process.env` directly rather than `ConfigService`. Module `providers`
 * arrays are evaluated at *import* time, long before Nest instantiates `ConfigModule` and runs
 * the zod validation — so DI is not available at the point where we must decide whether to
 * register a `@Processor`. The value is still validated fail-fast by `APP_ROLE` in
 * `env.schema.ts`, so a typo (`APP_ROLE=worke`) crashes at boot rather than silently falling
 * back to `all`.
 */
export type AppRole = "api" | "worker" | "all";

export const APP_ROLES: readonly AppRole[] = ["api", "worker", "all"] as const;

/** The configured role, defaulting to `all`. Unrecognised values are left to zod to reject. */
export function appRole(): AppRole {
  const raw = process.env.APP_ROLE?.trim();
  return (raw ? raw : "all") as AppRole;
}

/**
 * Whether this process should register BullMQ `@Processor` providers. False only in the
 * dedicated `api` role — note the api side still *enqueues* jobs normally, because queues are
 * registered globally by `QueueModule` and `@InjectQueue` works with zero processors present.
 */
export function workersEnabled(): boolean {
  return appRole() !== "api";
}

/** Whether this process serves HTTP/WebSocket traffic. */
export function httpEnabled(): boolean {
  return appRole() !== "worker";
}
