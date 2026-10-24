import { ENTITLED_MODULES, moduleFeatureKey } from "@erp/contracts";

/** `demo`-queue job names (M10 §4). The sweep is a `PLATFORM_JOBS` scheduler tick (unscoped). */
export const DEMO_PURGE_JOB = "demo.purge";
export const DEMO_IDLE_SWEEP_JOB = "demo.idle-sweep";
/** Fixed repeat key, so api/worker replicas never stack sweep schedulers. */
export const DEMO_IDLE_SWEEP_SCHEDULER_ID = "demo-idle-sweep";

/**
 * The deduplicating per-tenant purge job id — logout racing the sweep collapses onto one job.
 * Dot-separated (`demo.purge.{tid}`), not the spec's `demo.purge:{tid}`: BullMQ rejects custom
 * job ids containing `:` (it reserves the colon for its own key layout).
 */
export const demoPurgeJobId = (tenantId: string): string => `${DEMO_PURGE_JOB}.${tenantId}`;

/** Why a purge was triggered — recorded on the purge's `platform_audit_log` rows. */
export type DemoPurgeTrigger = "SIGN_OUT" | "IDLE" | "SESSIONS_ENDED" | "RETRY";

/** The `demo.purge` job payload (`withTenantJob` scopes the body to `tenantId`). */
export interface DemoPurgeJobData {
  tenantId: string;
  trigger: DemoPurgeTrigger;
}

/**
 * `tenant_feature` rows a sandbox is provisioned with (`demo-sandbox-provisioning` spec). The GTM
 * fifteen-minute path — order tracking (production), job costing (reporting over inventory issues
 * and the payroll run), LINE order updates (sales) — is on, and so is every other module: written
 * as explicit rows so a guided demo can toggle scope without re-provisioning. Guardrails are never
 * flags (design D7) — nothing here can arm real email/LINE/e-Tax/PromptPay.
 */
export const DEMO_FEATURE_DEFAULTS: Readonly<Record<string, boolean>> = Object.fromEntries(
  ENTITLED_MODULES.map((m) => [moduleFeatureKey(m), true]),
);

/** Plan a sandbox is attached to when the catalog has it (the DEMO_TEMPLATE tenant's plan). */
export const DEMO_PLAN_CODE = "FACTORY" as const;

/** Display name of every sandbox tenant (the seeded Thai factory). */
export const DEMO_TENANT_NAME = "โรงงานสาธิต (Demo Factory)";
