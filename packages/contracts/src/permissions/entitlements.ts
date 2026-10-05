import type { Permission } from "./catalog.js";

/**
 * The plan-gated modules (m8 design D2). Each is entitled by the reserved feature key
 * `module.<name>` — resolved `tenant_feature` override → `plan.features` default → off. IAM is
 * always available and deliberately has no key.
 */
export const ENTITLED_MODULES = ["hr", "inventory", "production", "sales", "reporting"] as const;
export type EntitledModule = (typeof ENTITLED_MODULES)[number];

/** The reserved feature key that entitles `module` (e.g. `module.hr`). */
export function moduleFeatureKey(module: EntitledModule): `module.${EntitledModule}` {
  return `module.${module}`;
}

/** Permission-code prefix → gated module. `iam.*` is absent: IAM is never gated. */
const MODULE_BY_PREFIX: Readonly<Record<string, EntitledModule>> = {
  hr: "hr",
  inventory: "inventory",
  production: "production",
  sales: "sales",
  report: "reporting",
};

/**
 * The gated module a permission code belongs to — derived from the code's first segment, so the
 * server's `assertModuleEnabled` and the web's nav gating map codes identically. `null` for codes
 * outside any gated module (IAM).
 */
export function moduleForPermission(code: Permission): EntitledModule | null {
  return MODULE_BY_PREFIX[code.split(".", 1)[0] ?? ""] ?? null;
}

/** The modules a resolved feature map entitles, in `ENTITLED_MODULES` order. */
export function entitledModules(features: Readonly<Record<string, boolean>>): EntitledModule[] {
  return ENTITLED_MODULES.filter((m) => features[moduleFeatureKey(m)] === true);
}
