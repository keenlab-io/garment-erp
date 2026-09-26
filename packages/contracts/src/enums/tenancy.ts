// Tenancy enums (M7 §1). Keep in sync with @erp/db/schema/enums.ts (parity is asserted
// by test once the db schema lands in M7 §2).

// Distinguishes real customer tenants from the demo pool (m10 provisions
// DEMO_TEMPLATE/DEMO_SANDBOX; M7 only ships CUSTOMER in practice).
export const TenantKind = {
  CUSTOMER: "CUSTOMER",
  DEMO_TEMPLATE: "DEMO_TEMPLATE",
  DEMO_SANDBOX: "DEMO_SANDBOX",
} as const;
export type TenantKind = (typeof TenantKind)[keyof typeof TenantKind];

// Tenant lifecycle. SUSPENDED/PURGING reject every request (login included);
// READ_ONLY rejects mutations only. The billing policy that flips this is m8 —
// M7 ships the enum and the central enforcement mechanism only.
export const TenantStatus = {
  ACTIVE: "ACTIVE",
  READ_ONLY: "READ_ONLY",
  SUSPENDED: "SUSPENDED",
  PURGING: "PURGING",
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

// How a `tenant_domain` hostname resolves: to a single named tenant, or into the
// m10 demo pool (not consumed until m10, but the mode exists so demo hosts are
// just another row rather than a special case).
export const DomainResolutionMode = {
  TENANT: "TENANT",
  DEMO_POOL: "DEMO_POOL",
} as const;
export type DomainResolutionMode = (typeof DomainResolutionMode)[keyof typeof DomainResolutionMode];
