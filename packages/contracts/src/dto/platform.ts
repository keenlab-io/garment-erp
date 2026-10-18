import { z } from "zod";
import { initContract } from "@ts-rest/core";
import { moneyString } from "../money/index.js";
import {
  DomainResolutionMode,
  PlanCode,
  SubscriptionInvoiceLineKind,
  SubscriptionInvoiceStatus,
  SubscriptionPaymentMethod,
  SubscriptionStatus,
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
export const subscriptionStatus = z.nativeEnum(SubscriptionStatus);
export const subscriptionInvoiceStatus = z.nativeEnum(SubscriptionInvoiceStatus);
export const subscriptionPaymentMethod = z.nativeEnum(SubscriptionPaymentMethod);
export const subscriptionInvoiceLineKind = z.nativeEnum(SubscriptionInvoiceLineKind);

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

/**
 * The first tenant super-admin `provisionTenant` creates (design D1). `temp_password` is returned
 * exactly once, in the provisioning response — only its argon2id hash is stored.
 */
export const ProvisionedTenantAdmin = z.object({
  id: uuid,
  username: z.string(),
  email: z.string().email(),
  temp_password: z.string(),
});
export type ProvisionedTenantAdmin = z.infer<typeof ProvisionedTenantAdmin>;

/** `POST /platform/tenants` result — the tenant plus its first super-admin (null if none requested). */
export const TenantProvisioned = z.object({
  tenant: TenantListItem,
  admin: ProvisionedTenantAdmin.nullable(),
});
export type TenantProvisioned = z.infer<typeof TenantProvisioned>;

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
 * admin explicitly names the tenant they're opening a support session against (m8
 * design D8). `reason` is stored verbatim and must be non-blank; `minutes` defaults to
 * `SUPPORT_SESSION_DEFAULT_MINUTES` and is capped server-side by
 * `SUPPORT_SESSION_MAX_MINUTES` (an over-cap request is a 400 VALIDATION_ERROR).
 */
export const SupportSessionCreate = z.object({
  tenant_id: uuid,
  reason: z.string().refine((v) => v.trim().length > 0, "A reason is required"),
  scope: supportSessionScope,
  minutes: z.number().int().positive().optional(),
});
export type SupportSessionCreate = z.infer<typeof SupportSessionCreate>;

export const SupportSessionRow = z.object({
  id: uuid,
  tenant_id: uuid,
  platform_admin_id: uuid,
  reason: z.string(),
  scope: supportSessionScope,
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

/**
 * An append-only `platform_audit_log` entry — control-plane actions, not tenant data.
 * `correlation_id` ties the row to the unit of work that wrote it (null on pre-M8 rows).
 */
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
  correlation_id: uuid.nullable(),
  /** The support session the row was written under (m8 task 6.2), else null. */
  support_session_id: uuid.nullable(),
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

// ── Subscription billing (M9 — offline invoicing, no payment gateway) ───────

export const Subscription = z.object({
  id: uuid,
  tenant_id: uuid,
  plan_id: uuid,
  status: subscriptionStatus,
  /** Negotiated annual fee (VAT-exclusive). */
  annual_fee: moneyString,
  term_start: z.string().datetime(),
  term_end: z.string().datetime(),
  cancelled_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type Subscription = z.infer<typeof Subscription>;

export const SubscriptionCreate = z.object({
  tenant_id: uuid,
  plan_id: uuid,
  annual_fee: moneyString,
  term_start: z.string().datetime(),
  /** Defaults to one year after `term_start` when omitted. */
  term_end: z.string().datetime().optional(),
});
export type SubscriptionCreate = z.infer<typeof SubscriptionCreate>;

export const SubscriptionCancelRequest = z.object({
  reason: z.string().refine((v) => v.trim().length > 0, "A reason is required"),
});
export type SubscriptionCancelRequest = z.infer<typeof SubscriptionCancelRequest>;

export const SubscriptionInvoiceLine = z.object({
  kind: subscriptionInvoiceLineKind,
  description: z.string().min(1),
  /** VAT-exclusive; negative for `UPFRONT_DISCOUNT`. */
  amount: moneyString,
});
export type SubscriptionInvoiceLine = z.infer<typeof SubscriptionInvoiceLine>;

export const SubscriptionInvoice = z.object({
  id: uuid,
  /** `SINV-{YYYY}-{seq}` from the control-plane sequence. */
  number: z.string(),
  subscription_id: uuid,
  tenant_id: uuid,
  status: subscriptionInvoiceStatus,
  lines: z.array(SubscriptionInvoiceLine),
  subtotal: moneyString,
  vat_amount: moneyString,
  total: moneyString,
  issued_at: z.string().datetime(),
  due_date: z.string().date().nullable(),
  paid_at: z.string().datetime().nullable(),
  payment_method: subscriptionPaymentMethod.nullable(),
  payment_reference: z.string().nullable(),
  paid_amount: moneyString.nullable(),
  voided_at: z.string().datetime().nullable(),
});
export type SubscriptionInvoice = z.infer<typeof SubscriptionInvoice>;

/**
 * Issue an invoice for a subscription. `include_setup_fee` is honoured only on the
 * subscription's first invoice; `upfront_discount` defaults server-side to
 * `annual_fee × 2/12` (m9 design D7) and is editable by the admin (non-negative magnitude;
 * rendered as a negative `UPFRONT_DISCOUNT` line).
 */
export const SubscriptionInvoiceIssue = z.object({
  subscription_id: uuid,
  setup_fee: moneyString.optional(),
  extra_seats: z
    .object({ seats: z.number().int().positive(), amount: moneyString })
    .optional(),
  upfront_discount: moneyString.optional(),
  due_date: z.string().date().optional(),
});
export type SubscriptionInvoiceIssue = z.infer<typeof SubscriptionInvoiceIssue>;

export const SubscriptionInvoicesQuery = paginationQuery.extend({
  tenant_id: uuid.optional(),
  subscription_id: uuid.optional(),
  "filter[status]": subscriptionInvoiceStatus.optional(),
});
export type SubscriptionInvoicesQuery = z.infer<typeof SubscriptionInvoicesQuery>;

/**
 * Mark an invoice paid (m9 design D1). An `amount` differing from the invoice total is a 422
 * unless `accept_partial` / `accept_over` is set explicitly.
 */
export const SubscriptionInvoiceMarkPaid = z.object({
  paid_at: z.string().datetime(),
  method: subscriptionPaymentMethod,
  reference: z.string().min(1),
  amount: moneyString,
  accept_partial: z.boolean().optional(),
  accept_over: z.boolean().optional(),
});
export type SubscriptionInvoiceMarkPaid = z.infer<typeof SubscriptionInvoiceMarkPaid>;

export const SubscriptionInvoiceVoidRequest = z.object({
  reason: z.string().refine((v) => v.trim().length > 0, "A reason is required"),
});
export type SubscriptionInvoiceVoidRequest = z.infer<typeof SubscriptionInvoiceVoidRequest>;

/** Signed download URL for a rendered invoice/quote PDF. */
export const BillingPdfUrl = z.object({ url: z.string() });
export type BillingPdfUrl = z.infer<typeof BillingPdfUrl>;

// ── Tax-benefit quoting (m9 design D6 — stateless compute) ───────────────────

/** Declared by the prospect; absence or any `false` means the benefit section is omitted. */
export const QuoteEligibility = z.object({
  registered_capital_at_most_5m: z.boolean(),
  annual_revenue_at_most_30m: z.boolean(),
  declared_by: z.string().min(1),
  declared_at: z.string().datetime(),
});
export type QuoteEligibility = z.infer<typeof QuoteEligibility>;

export const QuoteFees = z.object({
  annual_fee: moneyString,
  setup_fee: moneyString.optional(),
  upfront_discount: moneyString.optional(),
});
export type QuoteFees = z.infer<typeof QuoteFees>;

export const QuoteComputeRequest = z.object({
  plan: planCode,
  fees: QuoteFees,
  /** Contract term in years. */
  term: z.number().int().positive(),
  /** Quote date (defaults to today); the benefit is dead after 2027-12-31. */
  quote_date: z.string().date().optional(),
  prospect_name: z.string().min(1).optional(),
  eligibility: QuoteEligibility.optional(),
});
export type QuoteComputeRequest = z.infer<typeof QuoteComputeRequest>;

export const QuoteLine = z.object({
  kind: subscriptionInvoiceLineKind,
  description: z.string(),
  amount: moneyString,
});
export type QuoteLine = z.infer<typeof QuoteLine>;

export const QuoteMoneyRange = z.object({ min: moneyString, max: moneyString });
export type QuoteMoneyRange = z.infer<typeof QuoteMoneyRange>;

/**
 * Present only for declared-eligible, pre-sunset quotes with the depa catalog flag on.
 * `caveat` is always embedded and cannot be turned off.
 */
export const QuoteTaxBenefit = z.object({
  qualifying_spend: moneyString,
  non_qualifying_spend: moneyString,
  extra_deduction: moneyString,
  estimated_saving: QuoteMoneyRange,
  effective_price: QuoteMoneyRange,
  caveat: z.string().min(1),
});
export type QuoteTaxBenefit = z.infer<typeof QuoteTaxBenefit>;

export const QuoteResult = z.object({
  plan: planCode,
  term: z.number().int().positive(),
  quote_date: z.string().date(),
  lines: z.array(QuoteLine),
  /** First-year total, VAT-exclusive, at list. */
  first_year_total: moneyString,
  eligibility: QuoteEligibility.nullable(),
  /** Absent entirely (not zeroed) when ineligible, undeclared, post-sunset, or catalog flag off. */
  tax_benefit: QuoteTaxBenefit.optional(),
});
export type QuoteResult = z.infer<typeof QuoteResult>;

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
      responses: withErrors({ 201: TenantProvisioned }),
      summary: "Provision a new tenant (seeds tenant defaults and its first super-admin)",
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
    getTenantSubscription: {
      method: "GET",
      path: "/platform/tenants/:id/subscription",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: z.object({ subscription: Subscription }) }),
      summary: "Get a tenant's current subscription",
    },
    createSubscription: {
      method: "POST",
      path: "/platform/subscriptions",
      body: SubscriptionCreate,
      responses: withErrors({ 201: z.object({ subscription: Subscription }) }),
      summary: "Create a tenant's subscription (one active per tenant; platform-audited)",
    },
    cancelSubscription: {
      method: "POST",
      path: "/platform/subscriptions/:id/cancel",
      pathParams: z.object({ id: uuid }),
      body: SubscriptionCancelRequest,
      responses: withErrors({ 200: z.object({ subscription: Subscription }) }),
      summary: "Cancel a subscription (terminal; tenant goes READ_ONLY pending export/purge)",
    },
    issueSubscriptionInvoice: {
      method: "POST",
      path: "/platform/subscription-invoices",
      body: SubscriptionInvoiceIssue,
      responses: withErrors({ 201: z.object({ invoice: SubscriptionInvoice }) }),
      summary: "Issue a vendor-side subscription invoice (SINV number, typed lines)",
    },
    listSubscriptionInvoices: {
      method: "GET",
      path: "/platform/subscription-invoices",
      query: SubscriptionInvoicesQuery,
      responses: withErrors({ 200: paginated(SubscriptionInvoice) }),
      summary: "List subscription invoices (paginated, optional tenant/status filter)",
    },
    voidSubscriptionInvoice: {
      method: "POST",
      path: "/platform/subscription-invoices/:id/void",
      pathParams: z.object({ id: uuid }),
      body: SubscriptionInvoiceVoidRequest,
      responses: withErrors({ 200: z.object({ invoice: SubscriptionInvoice }) }),
      summary: "Void an unpaid subscription invoice (PAID invoices are not voidable)",
    },
    getSubscriptionInvoicePdf: {
      method: "GET",
      path: "/platform/subscription-invoices/:id/pdf",
      pathParams: z.object({ id: uuid }),
      responses: withErrors({ 200: BillingPdfUrl }),
      summary: "Get a signed URL for the invoice PDF (bank details + vendor PromptPay QR)",
    },
    markSubscriptionInvoicePaid: {
      method: "POST",
      path: "/platform/subscription-invoices/:id/mark-paid",
      pathParams: z.object({ id: uuid }),
      body: SubscriptionInvoiceMarkPaid,
      responses: withErrors({ 200: z.object({ invoice: SubscriptionInvoice }) }),
      summary:
        "Record an offline payment: extends the term, restores ACTIVE (422 on amount mismatch)",
    },
    computeQuote: {
      method: "POST",
      path: "/platform/quotes/compute",
      body: QuoteComputeRequest,
      responses: withErrors({ 200: QuoteResult }),
      summary: "Compute a stateless quote; tax-benefit section only for declared-eligible quotes",
    },
    getQuotePdf: {
      method: "POST",
      path: "/platform/quotes/pdf",
      body: QuoteComputeRequest,
      responses: withErrors({ 200: BillingPdfUrl }),
      summary: "Render a quote to PDF (accountant caveat always embedded with benefit figures)",
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
