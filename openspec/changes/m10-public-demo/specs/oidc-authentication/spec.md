## ADDED Requirements

### Requirement: Auth identity records for every sign-in method
The system SHALL persist one `auth_identity` row per (user, sign-in method) in
`packages/db/src/schema/platform/auth-identity.ts`, carrying `tenant_id`, `user_id` (FK to
`user`), `provider` (`PASSWORD | GOOGLE`, the `AuthProvider` enum duplicated in
`@erp/contracts/enums/tenancy.ts` and `@erp/db/schema/enums.ts` under the existing parity
test), `subject` (citext — the username for `PASSWORD`, the Google `sub` claim for
`GOOGLE`), `email` (citext, nullable), and `last_login_at`. Rows MUST be unique per
`(tenant_id, provider, subject)`. The argon2id password hash SHALL remain on
`user.password_hash` (design D8); `auth_identity` never stores a credential secret for
`PASSWORD`. The table SHALL be listed in the m7 `tenancy.parity.spec.ts` `TENANT_EXEMPT`
allowlist (no RLS policy — the demo-pool callback must look up identities before any
tenant context exists), and no API endpoint SHALL ever list or expose `auth_identity`
rows across tenants.

#### Scenario: Password user has a PASSWORD identity row
- **WHEN** a user account with a password is created (or the m10 migration backfills
  existing users)
- **THEN** an `auth_identity` row exists with `provider = PASSWORD`, `subject` equal to
  the username, and the user's `tenant_id`
- **AND** the argon2id hash lives only on `user.password_hash`

#### Scenario: Duplicate identity is rejected
- **WHEN** an insert attempts a second `auth_identity` row with the same
  `(tenant_id, provider, subject)` as an existing row
- **THEN** the unique constraint rejects it

#### Scenario: Same Google subject may exist in two tenants
- **WHEN** the same Google account (`sub` claim) holds an identity in tenant A and a
  separate identity in tenant B
- **THEN** both rows coexist (uniqueness is per tenant), each linked to that tenant's own
  `user` row

### Requirement: Google OIDC authorization-code flow
The system SHALL implement the OIDC authorization-code flow with PKCE and a signed
`state` parameter against Google, in `apps/api/src/auth/oidc/` on a `@Public()`
(class-level) controller: `GET /api/v1/auth/oidc/google/start` redirects to Google's
authorization endpoint, and `GET /api/v1/auth/oidc/google/callback` exchanges the code,
verifies the ID token (signature via Google's JWKS, `iss`, `aud` =
`GOOGLE_OAUTH_CLIENT_ID`, `exp`, `nonce`), and extracts `{ sub, email, email_verified,
name }`. The flow MUST bind the pre-login hostname-resolved tenant (or the demo pool)
into `state` at `/start` and verify it at `/callback` so a callback cannot be replayed
against a different tenant. `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` are
validated by `config/env.schema.ts`; when they are unset the OIDC endpoints MUST respond
with a uniform-envelope error and MUST NOT redirect to Google.

#### Scenario: Successful code exchange
- **WHEN** Google redirects to `/auth/oidc/google/callback` with a valid code and the
  `state` issued by `/start`
- **THEN** the API exchanges the code, verifies the ID token against Google's JWKS with
  matching `iss`/`aud`/`exp`/`nonce`, and proceeds to identity matching

#### Scenario: Tampered state is rejected
- **WHEN** the callback presents a `state` that was not issued by `/start`, has expired,
  or names a different tenant than the one the flow started on
- **THEN** the request is rejected with 401 UNAUTHENTICATED
- **AND** no code exchange with Google is attempted

#### Scenario: Unverified email is rejected for signup paths
- **WHEN** the verified ID token carries `email_verified = false` on a flow that would
  create a new user (self-signup / sandbox provisioning)
- **THEN** the sign-in is refused and no user or tenant is created

#### Scenario: OIDC unconfigured
- **WHEN** `GOOGLE_OAUTH_CLIENT_ID` or `GOOGLE_OAUTH_CLIENT_SECRET` is unset and a client
  requests `/auth/oidc/google/start`
- **THEN** the response is the uniform error envelope (no redirect to Google)

### Requirement: OIDC sign-in matches identities and issues standard tokens
On a verified callback for a tenant resolved with `resolution_mode = TENANT`, the system
SHALL look up `auth_identity` by `(tenant_id, GOOGLE, sub)`. A match SHALL sign in the
linked user through the **same** machinery as password login: session row created,
`TokenService` access token `{ sub, sid, pv, tid }` + refresh token, `last_login_at`
updated on the identity, `UserLoggedIn` emitted. There is no parallel session or token
mechanism for OIDC. The linked user MUST still satisfy the guard's normal conditions
(status ACTIVE, etc.); OIDC bypasses only the password check, nothing else.

#### Scenario: Known Google identity signs in
- **WHEN** the callback's verified `sub` matches an `auth_identity` row
  `(tenant_id, GOOGLE, sub)` for an ACTIVE user
- **THEN** a session row is created and the standard `{ access_token, refresh_token,
  expires_in }` pair is issued with `tid` equal to the identity's tenant
- **AND** the identity's `last_login_at` is updated

#### Scenario: Disabled user cannot enter via Google
- **WHEN** the matched identity's user has status `DISABLED`
- **THEN** the sign-in is refused with 401 and no session is created

#### Scenario: Google login is a per-tenant capability
- **WHEN** the resolved tenant has Google login disabled (its `tenant_feature` /
  configuration does not enable the `GOOGLE` provider)
- **THEN** `/auth/oidc/google/start` for that tenant is refused and no authorization
  redirect is issued

### Requirement: Self-service signup is gated by allow_self_signup
The `tenant` table SHALL carry `allow_self_signup boolean NOT NULL DEFAULT false`. When a
verified Google identity matches **no** `auth_identity` row for the resolved tenant, the
system SHALL create a new user + `GOOGLE` identity **only if** the tenant's
`allow_self_signup` is true; otherwise it MUST refuse with 403 FORBIDDEN and create
nothing. Only demo-pool sandbox provisioning sets the flag true
(`demo-sandbox-provisioning`); m8 tenant provisioning MUST leave it false so no Gmail
address can walk into a real factory's tenant (design D5). `tenant_id` for the created
user comes exclusively from the resolved tenant context — never from a request body,
query parameter, or header.

#### Scenario: Unknown Google identity on a customer tenant is refused
- **WHEN** a verified Google callback for a `CUSTOMER` tenant with
  `allow_self_signup = false` matches no existing identity
- **THEN** the response is 403 FORBIDDEN
- **AND** no `user`, `auth_identity`, or `session` row is created

#### Scenario: Signup where the flag is on
- **WHEN** a verified Google callback matches no identity on a tenant whose
  `allow_self_signup` is true (the demo pool)
- **THEN** a user and its `GOOGLE` identity are created in that tenant and sign-in
  proceeds

#### Scenario: tenant_id cannot be supplied by the client
- **WHEN** an OIDC start or callback request carries a `tenant_id` in the body, query
  string, or a header
- **THEN** the value is ignored; the tenant is derived solely from the hostname-resolved
  pre-login context bound into `state`
