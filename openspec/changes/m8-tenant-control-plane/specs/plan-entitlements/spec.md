## ADDED Requirements

### Requirement: Plan catalog with included seats
The `plan` table SHALL carry `code` (`WORKSHOP | FACTORY | MULTISITE | SELFHOSTED`),
`included_seats` (8 / 20 / 40 / 20 respectively), and a `features` jsonb map of default
feature keys, seeded by migration and editable only by platform admins. Every tenant
MUST reference exactly one plan via `tenant.plan_id`. Pricing columns are deliberately
absent — M9 adds them with the subscription model.

#### Scenario: Plans are seeded with the GTM seat counts
- **WHEN** migrations and seed run on a fresh database
- **THEN** four plan rows exist with codes WORKSHOP/FACTORY/MULTISITE/SELFHOSTED and included seats 8/20/40/20

### Requirement: Module access is gated by resolved entitlement
Module entitlement SHALL be expressed as reserved feature keys (`module.hr`,
`module.inventory`, `module.production`, `module.sales`, `module.reporting`; IAM is
always available), resolved as `tenant_feature` override → `plan.features` default →
off. Handlers in gated modules MUST call `assertModuleEnabled(user, code)` beside
`assertPermissions`; a request into an unentitled module MUST be rejected with 403
FORBIDDEN whose details name the missing module, regardless of the user's permissions —
tenant super-admins do NOT bypass entitlement. The web nav MUST hide unentitled modules
using the resolved entitlements delivered via `GET /auth/me`.

#### Scenario: Unentitled module is rejected server-side
- **WHEN** a tenant on a plan without `module.hr` calls any HR endpoint, even as tenant super-admin
- **THEN** the request is rejected with 403 and a detail naming `module.hr`

#### Scenario: Platform override enables a module as an add-on
- **WHEN** a platform admin sets `tenant_feature (tenant_id, "module.hr", enabled = true)` for that tenant
- **THEN** subsequent HR requests by permitted users succeed without redeploy or re-login beyond the next entitlement resolution
- **AND** the HR nav entry appears in the web app

### Requirement: Multi-site is one tenant
The `MULTISITE` plan SHALL differ from other plans only in `included_seats` and feature
defaults. Multi-site operation MUST be modeled with the existing `warehouse` and
`department` dimensions inside a single tenant; nothing in provisioning, billing, or the
schema SHALL create a second tenant, a tenant hierarchy, or cross-tenant links for a
multi-site customer.

#### Scenario: A second location is a warehouse, not a tenant
- **WHEN** a MULTISITE customer adds their second factory location
- **THEN** it is created as `warehouse`/`department` rows within their existing tenant
- **AND** all users, documents, and reports remain in that one tenant scope
