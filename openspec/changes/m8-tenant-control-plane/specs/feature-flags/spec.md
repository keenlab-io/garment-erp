## ADDED Requirements

### Requirement: Three-layer flag resolution
Feature resolution SHALL be, per key: explicit `tenant_feature (tenant_id, key,
enabled)` row → `plan.features` default → off. `EntitlementsService.resolve(tenantId)`
in `apps/api/src/platform/` MUST return the merged map, computed at most once per
request (cached on the M7 `tenantContext`), and MUST be the single resolution path for
both module keys (`module.*`) and fine-grained flags — there is no second flag
mechanism.

#### Scenario: Tenant override beats plan default
- **WHEN** a plan's `features` sets a key false and the tenant has a `tenant_feature` row with `enabled = true`
- **THEN** the resolved value is true

#### Scenario: Absent everywhere means off
- **WHEN** a key exists in neither the tenant's rows nor the plan defaults
- **THEN** the resolved value is false

### Requirement: Platform-admin override API
Only platform admins SHALL write `tenant_feature` rows, via the control-plane API
(`platformContract`). Each write MUST record a `platform_audit_log` row with before and
after values. Tenants read their resolved flags but cannot modify them in M8.

#### Scenario: Override is audited
- **WHEN** a platform admin enables a flag for a tenant
- **THEN** a `platform_audit_log` row records the admin, tenant, key, and the false→true change

### Requirement: Resolved flags reach the web client
`GET /auth/me` SHALL include the tenant's resolved feature map (and derived module
entitlements) so `filterNav` and screen-level gating in `apps/web` work from the same
resolution the server enforces — the client never re-derives plan defaults.

#### Scenario: Client and server agree
- **WHEN** a flag is toggled for a tenant and a user re-authenticates or refreshes their session data
- **THEN** the nav and screens reflect exactly the flags the server would enforce on request
