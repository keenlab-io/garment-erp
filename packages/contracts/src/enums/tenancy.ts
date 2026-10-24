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

// The commercial package a tenant subscribes to (m8 design D10) — `plan.code`. Seats and
// feature defaults live on the `plan` row itself; this is just the stable code. SELFHOSTED
// is the plan self-hosted deployments check seats against even though the platform module
// (and the rest of the control plane) is never mounted for them.
export const PlanCode = {
  WORKSHOP: "WORKSHOP",
  FACTORY: "FACTORY",
  MULTISITE: "MULTISITE",
  SELFHOSTED: "SELFHOSTED",
} as const;
export type PlanCode = (typeof PlanCode)[keyof typeof PlanCode];

// Scope of a support-impersonation session (m8 design D8). FULL resolves the platform
// admin's effective permissions as the tenant's super-admin; READ_ONLY additionally routes
// every request through `TenantStateGuard`'s read-only rules regardless of the tenant's
// actual lifecycle status.
export const SupportSessionScope = {
  READ_ONLY: "READ_ONLY",
  FULL: "FULL",
} as const;
export type SupportSessionScope = (typeof SupportSessionScope)[keyof typeof SupportSessionScope];

// Lifecycle of a queued per-tenant PDPA export (m8 design D9) — mirrors the M6
// `ExportStatus` shape (PENDING/RUNNING carry no file, DONE returns a signed URL, FAILED
// never does), kept as its own enum since it names a different job family.
export const TenantExportStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;
export type TenantExportStatus = (typeof TenantExportStatus)[keyof typeof TenantExportStatus];

// Subscription lifecycle (m9 design D3). The dunning sweep drives ACTIVE → IN_GRACE → EXPIRED;
// CANCELLED is a manual terminal state. Mark-paid restores ACTIVE from any non-CANCELLED state.
export const SubscriptionStatus = {
  ACTIVE: "ACTIVE",
  IN_GRACE: "IN_GRACE",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

// Vendor-side `subscription_invoice` status (m9 design D2). PAID invoices are not voidable.
export const SubscriptionInvoiceStatus = {
  ISSUED: "ISSUED",
  PAID: "PAID",
  VOID: "VOID",
} as const;
export type SubscriptionInvoiceStatus =
  (typeof SubscriptionInvoiceStatus)[keyof typeof SubscriptionInvoiceStatus];

// How an offline subscription payment was received (m9 design D1) — no gateway, no cards.
export const SubscriptionPaymentMethod = {
  BANK_TRANSFER: "BANK_TRANSFER",
  PROMPTPAY: "PROMPTPAY",
} as const;
export type SubscriptionPaymentMethod =
  (typeof SubscriptionPaymentMethod)[keyof typeof SubscriptionPaymentMethod];

// Typed line on a subscription invoice (m9 design D2/D7). UPFRONT_DISCOUNT is a negative line.
export const SubscriptionInvoiceLineKind = {
  ANNUAL_FEE: "ANNUAL_FEE",
  SETUP_FEE: "SETUP_FEE",
  EXTRA_SEATS: "EXTRA_SEATS",
  UPFRONT_DISCOUNT: "UPFRONT_DISCOUNT",
} as const;
export type SubscriptionInvoiceLineKind =
  (typeof SubscriptionInvoiceLineKind)[keyof typeof SubscriptionInvoiceLineKind];

// How a user authenticated (m10 design D8). PASSWORD is the existing credential login;
// GOOGLE is the OIDC seam the public demo uses (a guest never creates a password) and
// that paying tenants may opt into later.
export const AuthProvider = {
  PASSWORD: "PASSWORD",
  GOOGLE: "GOOGLE",
} as const;
export type AuthProvider = (typeof AuthProvider)[keyof typeof AuthProvider];
