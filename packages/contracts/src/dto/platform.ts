import { z } from "zod";
import { initContract } from "@ts-rest/core";
import {
  DomainResolutionMode,
  PlanCode,
  SupportSessionScope,
  TenantExportStatus,
  TenantKind,
  TenantStatus,
} from "../enums/index.js";
import {
  API_PREFIX,
  jobAccepted,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M7/M8 — Tenant Control Plane contract (m8 proposal §1.3). Router `platformContract`
 * covers `platform_admin` authentication, tenant provisioning/lifecycle/purge/export,
 * the plan catalog, `tenant_feature` overrides, and the time-boxed, audited
 * support-session impersonation seam. Platform admins are a separate principal from
 * tenant users — platform tokens never pass the tenant `JwtGuard` and tenant tokens
 * never pass the platform guard (design D7). Every endpoint here is where a platform
 * admin legitimately names a target tenant; no other DTO in this package ever accepts
 * a `tenant_id` from request input.
 */

const c = initContract();

export const tenantKind = z.nativeEnum(TenantKind);
export const tenantStatus = z.nativeEnum(TenantStatus);
export const domainResolutionMode = z.nativeEnum(DomainResolutionMode);
export const planCode = z.nativeEnum(PlanCode);
export const supportSessionScope = z.nativeEnum(SupportSessionScope);
export const tenantExportStatus = z.nativeEnum(TenantExportStatus);

// ── Platform auth ─────────────────────────────────────────────────────────────

export const PlatformLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type PlatformLoginBody = z.infer<typeof PlatformLoginBody>;

/** Issued token pair for a platform_admin session — separate audience from tenant tokens. */
export const PlatformTokenPair = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().int().positive(),
});
export type PlatformTokenPair = z.infer<typeof PlatformTokenPair>;

export const PlatformRefreshRequest = z.object({
  refresh_token: z.string().min(1),
});
export type PlatformRefreshRequest = z.infer<typeof PlatformRefreshRequest>;

/** The authenticated platform_admin identity returned by `GET /platform/auth/me`. */
export const PlatformMeResponse = z.object({
  id: uuid,
  email: z.string().email(),
});
export type PlatformMeResponse = z.infer<typeof PlatformMeResponse>;

// ── Tenant provisioning & lifecycle ──────────────────────────────────────────

/**
 * Provisioning input — never a `tenant_id`; the id is server-generated. `plan_id` and the
 * first tenant super-admin fields are optional at the contract layer until §2 (`tenant.plan_id`)
 * and §4 (`ProvisioningService` seeding the admin user) land; a real cloud provision always
 * supplies them (design D1).
 */
export const TenantCreate = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(1).optional(),
  plan_id: uuid.optional(),
  admin_email: z.string().email().optional(),
  admin_name: z.string().min(1).optional(),
});
export type TenantCreate = z.infer<typeof TenantCreate>;

export const TenantListItem = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  kind: tenantKind,
  status: tenantStatus,
  created_at: z.string().datetime(),
});
export type TenantListItem = z.infer<typeof TenantListItem>;

export const TenantStatusUpdate = z.object({
  status: tenantStatus,
  reason: z.string().min(1),
});
export type TenantStatusUpdate = z.infer<typeof TenantStatusUpdate>;

/** Tenants list query — cursor pagination plus the optional `filter[status]`/`filter[kind]` facets. */
export const TenantsQuery = paginationQuery.extend({
  "filter[status]": tenantStatus.optional(),
  "filter[kind]": tenantKind.optional(),
});
export type TenantsQuery = z.infer<typeof TenantsQuery>;

/** Purge requires a typed confirmation phrase (the tenant's slug) — design D9. */
export const TenantPurgeRequest = z.object({
  confirm: z.string().min(1),
});
export type TenantPurgeRequest = z.infer<typeof TenantPurgeRequest>;

/** `GET .../exports/:job_id` — mirrors the M6 `ExportStatusResult` shape (design D9). */
export const TenantExportStatusResult = z.object({
  status: tenantExportStatus,
  file_url: z.string().optional(),
});
export type TenantExportStatusResult = z.infer<typeof TenantExportStatusResult>;

// ── Plans (seed data; editable only by platform admins — design D10) ────────

export const Plan = z.object({
  id: uuid,
  code: planCode,
  included_seats: z.number().int().positive(),
  features: z.record(z.boolean()),
});
export type Plan = z.infer<typeof Plan>;

/** Partial update — pricing columns are deliberately absent (M9 owns those). */
export const UpdatePlanRequest = z.object({
  included_seats: z.number().int().positive().optional(),
  features: z.record(z.boolean()).optional(),
});
export type UpdatePlanRequest = z.infer<typeof UpdatePlanRequest>;

// ── Feature overrides (`tenant_feature` — design D2) ─────────────────────────

export const TenantFeature = z.object({
  tenant_id: uuid,
  key: z.string().min(1),
  enabled: z.boolean(),
});
export type TenantFeature = z.infer<typeof TenantFeature>;

export const SetTenantFeatureRequest = z.object({
  enabled: z.boolean(),
});
export type SetTenantFeatureRequest = z.infer<typeof SetTenantFeatureRequest>;

// ── Support sessions (audited, time-boxed impersonation) ────────────────────

/**
 * The one surface where a tenant id is a legitimate request argument — a platform
 * admin explicitly names the tenant they're opening a support session against.
 */
export const SupportSessionCreate = z.object({
  tenant_id: uuid,
  reason: z.string().min(1),
  minutes: z.number().int().positive().max(480),
});
export type SupportSessionCreate = z.infer<typeof SupportSessionCreate>;

export const SupportSessionRow = z.object({
  id: uuid,
  tenant_id: uuid,
  reason: z.string(),
  expires_at: z.string().datetime(),
  revoked_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type SupportSessionRow = z.infer<typeof SupportSessionRow>;

/** Response to creating a support session — the row plus the minted `tid`+`sup` access token. */
export const SupportSessionCreated = z.object({
  support_session: SupportSessionRow,
  access_token: z.string(),
});
export type SupportSessionCreated = z.infer<typeof SupportSessionCreated>;

/** Support-sessions list query — cursor pagination plus the optional `tenant_id` facet. */
export const SupportSessionsQuery = paginationQuery.extend({
  tenant_id: uuid.optional(),
});
export type SupportSessionsQuery = z.infer<typeof SupportSessionsQuery>;

// ── Platform audit ────────────────────────────────────────────────────────────

/** An append-only `platform_audit_log` entry — control-plane actions, not tenant data. */
export const PlatformAuditRow = z.object({
  id: uuid,
  at: z.string().datetime(),
  platform_admin_id: uuid.nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: uuid.nullable(),
  tenant_id: uuid.nullable(),
  reason: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type PlatformAuditRow = z.infer<typeof PlatformAuditRow>;

export const PlatformAuditQuery = paginationQuery.extend({
  entity_type: z.string().optional(),
  entity_id: uuid.optional(),
  tenant_id: uuid.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type PlatformAuditQuery = z.infer<typeof PlatformAuditQuery>;

// ── Router ────────────────────────────────────────────────────────────────────

export const platformContract = c.router(
  {
    login: {
      method: "POST",
      path: "/platform/auth/login",
      body: PlatformLoginBody,
      responses: withErrors({ 200: PlatformTokenPair }),
      summary: "Authenticate a platform_admin and issue a platform token pair",
    },
    refresh: {
      method: "POST",
      path: "/platform/auth/refresh",
      body: PlatformRefreshRequest,
      responses: withErrors({ 200: PlatformTokenPair }),
      summary: "Exchange a platform refresh token for a fresh token pair",
    },
    logout: {
      method: "POST",
      path: "/platform/auth/logout",
      body: c.noBody(),
      responses: withErrors({ 204: z.void() }),
      summary: "Revoke the current platform_admin session",
    },
    me: {
      method: "GET",
      path: "/platform/auth/me",
      responses: withErrors({ 200: PlatformMeResponse }),
      summary: "Current platform_admin identity",
    },
    listTenants: {
      method: "GET",
      path: "/platform/tenants",
      query: TenantsQuery,
      responses: withErrors({ 200: paginated(TenantListItem) }),
      summary: "List tenants (paginated, optional status/kind filter)",
    },
    createTenant: {
      method: "POST",
      path: "/platform/tenants",
      body: TenantCreate,
      responses: withErrors({ 201: z.object({ tenant: TenantListItem }) }),
      summary: "Provision a new tenant (seeds tenant defaults)",
    },
    setTenantStatus: {
      method: "POST",
      path: "/platform/tenants/:id/status",
      pathParams: z.object({ id: uuid }),
      body: TenantStatusUpdate,
      responses: withErrors({ 200: z.object({ tenant: TenantListItem }) }),
      summary: "Change a tenant's lifecycle status (reason required, platform-audited)",
    },
    purgeTenant: {
      method: "POST",
      path: "/platform/tenants/:id/purge",
      pathParams: z.object({ id: uuid }),
      body: TenantPurgeRequest,
      responses: withErrors({ 202: jobAccepted }),
      summary: "Queue an irreversible purge of a SUSPENDED tenant (typed confirmation required)",
    },
    exportTenant: {
      method: "POST",
      path: "/platform/tenants/:id/export",
      pathParams: z.object({ id: uuid }),
      body: c.noBody(),
      responses: withErrors({ 202: jobAccepted }),
      summary: "Queue a PDPA export of a tenant's data (allowed even while READ_ONLY)",
    },
    getTenantExport: {
      method: "GET",
      path: "/platform/tenants/:id/exports/:job_id",
      pathParams: z.object({ id: uuid, job_id: z.string() }),
      responses: withErrors({ 200: TenantExportStatusResult }),
      summary: "Get tenant export job status and, once DONE, a signed download URL",
    },
    listPlans: {
      method: "GET",
      path: "/platform/plans",
      responses: withErrors({ 200: z.array(Plan) }),
      summary: "List the seeded plan catalog",
    },
    getPlan: {
      method: "GET",
      path: "/platform/plans/:id",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.object({ plan: Plan }) }),
      summary: "Get a plan",
    },
    updatePlan: {
      method: "PUT",
      path: "/platform/plans/:id",
      pathParams: z.object({ id: uuid }),
      body: UpdatePlanRequest,
      responses: withErrors({ 200: z.object({ plan: Plan }) }),
      summary: "Update a plan's included seats or feature defaults",
    },
    listTenantFeatures: {
      method: "GET",
      path: "/platform/tenants/:id/features",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.array(TenantFeature) }),
      summary: "List a tenant's `tenant_feature` overrides",
    },
    setTenantFeature: {
      method: "PUT",
      path: "/platform/tenants/:id/features/:key",
      pathParams: z.object({ id: uuid, key: z.string().min(1) }),
      body: SetTenantFeatureRequest,
      responses: withErrors({ 200: z.object({ feature: TenantFeature }) }),
      summary: "Set a tenant's override for a feature key (platform-audited)",
    },
    deleteTenantFeature: {
      method: "DELETE",
      path: "/platform/tenants/:id/features/:key",
      pathParams: z.object({ id: uuid, key: z.string().min(1) }),
      body: c.noBody(),
      responses: withErrors({ 204: z.void() }),
      summary: "Remove a tenant's override, reverting the key to the plan default",
    },
    createSupportSession: {
      method: "POST",
      path: "/platform/support-sessions",
      body: SupportSessionCreate,
      responses: withErrors({ 201: SupportSessionCreated }),
      summary: "Open a time-boxed, reason-tagged support session against a tenant",
    },
    revokeSupportSession: {
      method: "POST",
      path: "/platform/support-sessions/:id/revoke",
      pathParams: z.object({ id: uuid }),
      body: c.noBody(),
      responses: withErrors({ 204: z.void() }),
      summary: "Revoke an active support session (i.e. end it early)",
    },
    listSupportSessions: {
      method: "GET",
      path: "/platform/support-sessions",
      query: SupportSessionsQuery,
      responses: withErrors({ 200: paginated(SupportSessionRow) }),
      summary: "List support sessions (paginated, optional tenant filter)",
    },
    listAudit: {
      method: "GET",
      path: "/platform/audit",
      query: PlatformAuditQuery,
      responses: withErrors({ 200: paginated(PlatformAuditRow) }),
      summary: "Query the control-plane audit log",
    },
  },
  { pathPrefix: API_PREFIX },
);
