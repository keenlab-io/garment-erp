## ADDED Requirements

### Requirement: Platform admin is a separate principal with a separate login surface
Platform operators SHALL live in the `platform_admin` table (citext email unique,
argon2id `password_hash`, lockout columns mirroring `user`) — never as rows in any
tenant's `user` table and never via a flag on `user`. Authentication is
`/platform/auth/login|refresh|logout|me`, mounted only when `DEPLOYMENT_MODE=cloud`,
with the same 5-failure/15-minute lockout policy as tenant login. Platform access
tokens SHALL carry `{pid, sid}` and MUST NOT carry `tid` or `sub`.

#### Scenario: Token domains do not cross
- **WHEN** a platform token is presented to any tenant business endpoint, or a tenant token to any `/platform/*` endpoint
- **THEN** the request is rejected with 401
- **AND** no RLS-scoped query executes with a platform token

#### Scenario: Self-hosted mode has no control plane
- **WHEN** the API boots with `DEPLOYMENT_MODE=self-hosted`
- **THEN** no `/platform/*` route is mounted and no platform login exists

### Requirement: Control-plane actions are append-only audited
Every control-plane mutation (provision, lifecycle transition, plan edit, feature
override, support-session create/end, export, purge) SHALL write one
`platform_audit_log` row: acting `platform_admin_id`, action, target tenant, before and
after payloads, timestamp, correlation id. The table is append-only, carries no
`tenant_id` RLS (it is `TENANT_EXEMPT`), and MUST survive the purge of any tenant it
references.

#### Scenario: The ledger outlives the tenant
- **WHEN** a tenant is purged
- **THEN** the `platform_audit_log` rows recording its provisioning, suspension, and purge remain queryable

### Requirement: Platform admins never read tenant data directly
Outside an active support session (see `support-impersonation`), the control-plane API
SHALL expose only tenant metadata (name, domain, plan, status, seat counts, flags) —
no endpoint returns tenant business rows to a platform token, and the runtime DB role
(`erp_app`, `NOBYPASSRLS`) makes bypass impossible below the API too.

#### Scenario: Metadata yes, business data no
- **WHEN** a platform admin lists tenants and inspects one
- **THEN** they see plan, status, domains, and seat usage
- **AND** no invoice, employee, or payroll data of that tenant is reachable without opening a support session
