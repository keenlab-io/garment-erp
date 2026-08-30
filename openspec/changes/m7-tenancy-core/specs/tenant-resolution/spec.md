## ADDED Requirements

### Requirement: Tenant and domain model
The platform schema SHALL define a `tenant` table (`slug` citext unique, `name`,
`kind` ∈ `CUSTOMER | DEMO_TEMPLATE | DEMO_SANDBOX`, `status` ∈
`ACTIVE | READ_ONLY | SUSPENDED | PURGING`, audit + version columns) and a
`tenant_domain` table (`hostname` citext unique, `tenant_id` FK, `resolution_mode` ∈
`TENANT | DEMO_POOL`). Hostname→tenant mapping SHALL be a table lookup, not subdomain
parsing of `APP_DOMAIN`, so one mechanism serves app subdomains, customer vanity domains
(`erp.theirfactory.co.th`), and the m10 demo-pool host, which is not a subdomain of the
app domain at all. Both tables are in the `TENANT_EXEMPT` allowlist.

#### Scenario: A vanity domain resolves like a subdomain
- **WHEN** a `tenant_domain` row maps `erp.theirfactory.co.th` to a tenant
- **THEN** requests arriving on that host resolve to that tenant with no code change or `APP_DOMAIN` relationship

#### Scenario: An unknown host resolves nothing
- **WHEN** a request arrives on a hostname with no `tenant_domain` row (cloud mode)
- **THEN** `GET /public/tenant-context` returns 404 and login on that host is refused

### Requirement: Hostname resolves the tenant pre-login only
Before authentication, the tenant SHALL be resolved from the request's hostname via
`TenantResolutionService.byHostname` and used only for: pre-login branding
(`GET /public/tenant-context`), the tenant-scoped credential lookup at login, and
per-tenant lockout. A resolution middleware SHALL enter `tenantContext`
(`source: "host"`) for `@Public()` routes. The `Host` header MUST NOT be used for
scoping on any authenticated request.

#### Scenario: Login screen shows the right factory
- **WHEN** an unauthenticated browser loads the login page on tenant A's hostname
- **THEN** `GET /public/tenant-context` returns tenant A's display name and branding

#### Scenario: Credentials are checked against the host's tenant
- **WHEN** a user submits a username that exists in tenant A and tenant B, on tenant A's hostname
- **THEN** the lookup runs against `(tenant A, username)` and tenant B's account is never consulted

### Requirement: After login the tid claim is authoritative
Once authenticated, the tenant SHALL be derived exclusively from the verified `tid`
claim in the access token. A mismatch between the token's `tid` and the request host's
resolved tenant SHALL NOT change scoping (it MAY be logged as an anomaly). API clients
holding a valid token are fully served regardless of hostname.

#### Scenario: Token beats host
- **WHEN** a request carries tenant B's valid token but arrives on tenant A's hostname
- **THEN** the request is scoped to tenant B (the signed claim), and at most an anomaly log line is emitted

#### Scenario: Non-browser clients need no hostname relationship
- **WHEN** an integration script calls the API on the bare `APP_DOMAIN` with a tenant B token
- **THEN** the request succeeds, scoped to tenant B

### Requirement: Tenant lifecycle status is enforced centrally
Tenant `status` SHALL be enforced by one central gate (`TenantStatusGuard` in
`apps/api/src/tenancy/`): `SUSPENDED` and `PURGING` reject every request including
login; `READ_ONLY` rejects mutating methods with error code `TENANT_READ_ONLY` while
reads continue to work. M7 ships the mechanism only — the billing policy that flips a
tenant to `READ_ONLY` (grace-period degradation, never a hard mid-shift lockout) is m8.

#### Scenario: Read-only tenant can still read payroll
- **WHEN** a user of a `READ_ONLY` tenant lists payslips and then attempts to post a goods receipt
- **THEN** the list succeeds and the post is rejected with 403 `TENANT_READ_ONLY`

#### Scenario: Suspended tenant is fully closed
- **WHEN** any user of a `SUSPENDED` tenant attempts login or presents an existing valid token
- **THEN** the request is rejected and no tenant data is readable

### Requirement: Self-hosted deployment mode preserves parity with one tenant
With `DEPLOYMENT_MODE=self-hosted` (validated in `config/env.schema.ts`), boot SHALL
ensure exactly one tenant exists (slug `DEFAULT_TENANT_SLUG`, provisioned via the same
`TenantProvisioningService` + `seedTenantDefaults` path as cloud provisioning), the
platform control plane (`apps/api/src/platform/` controllers) SHALL NOT be registered,
and hostname resolution SHALL short-circuit to that single tenant for any host. All
isolation mechanics (RLS, roles, `tid` claims, prefixes) run identically to cloud mode —
one codebase, one build.

#### Scenario: Self-hosted boots to one tenant
- **WHEN** the API boots with `DEPLOYMENT_MODE=self-hosted` against an empty database (post-migration)
- **THEN** exactly one tenant exists afterward and repeated boots do not create more

#### Scenario: Control plane is absent, not just forbidden
- **WHEN** any client requests a `/platform/*` route on a self-hosted deployment
- **THEN** the route does not exist (404) because the platform module was never registered

#### Scenario: Any hostname works on-premises
- **WHEN** a self-hosted instance receives a login request on an internal hostname with no `tenant_domain` row
- **THEN** resolution short-circuits to the default tenant and login proceeds
