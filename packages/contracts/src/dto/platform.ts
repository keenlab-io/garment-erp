import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { DomainResolutionMode, TenantKind, TenantStatus } from "../enums/index.js";
import {
  API_PREFIX,
  paginated,
  paginationQuery,
  uuid,
  withErrors,
} from "./_shared.js";

/**
 * M7 — Tenancy Core: control-plane contract (spec §1.3). Router `platformContract`
 * covers `platform_admin` authentication, tenant provisioning/status, and the
 * time-boxed, audited support-session impersonation seam. Platform admins are a
 * separate principal from tenant users — platform tokens never pass the tenant
 * `JwtGuard` and tenant tokens never pass the platform guard (design D6). Every
 * endpoint here is where a platform admin legitimately names a target tenant; no
 * other DTO in this package ever accepts a `tenant_id` from request input.
 */

const c = initContract();

export const tenantKind = z.nativeEnum(TenantKind);
export const tenantStatus = z.nativeEnum(TenantStatus);
export const domainResolutionMode = z.nativeEnum(DomainResolutionMode);

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

// ── Tenant provisioning & lifecycle ──────────────────────────────────────────

/** Provisioning input — never a `tenant_id`; the id is server-generated. */
export const TenantCreate = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  domain: z.string().min(1).optional(),
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
      summary: "Revoke an active support session",
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
