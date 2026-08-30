## MODIFIED Requirements

### Requirement: Idempotency-Key header on mutating requests
The API SHALL accept an optional `Idempotency-Key` header on mutating requests
(POST/PUT/PATCH/DELETE). Keys MUST be scoped per tenant and user: the stored record is
keyed by `(tenant_id, key, user_id)`, so the same key value used in two different
tenants — or by two different users — never interferes, and a replay lookup can never
match a record written in another tenant (the `idempotency_key` table is under
Row-Level Security like any business table). Requests without the header SHALL execute
normally with no idempotency behavior.

#### Scenario: Request without a key executes normally
- **WHEN** a mutating request is sent without an `Idempotency-Key` header
- **THEN** the request executes normally and no idempotency record is stored

#### Scenario: Same key from different users is independent
- **WHEN** user A and user B of the same tenant each send a mutating request with the identical `Idempotency-Key` value
- **THEN** both requests execute their side effects, each stored under its own `(tenant_id, key, user_id)` record

#### Scenario: Same key across tenants is independent
- **WHEN** users in tenant A and tenant B each send a mutating request with the identical `Idempotency-Key` value
- **THEN** both requests execute their side effects and neither can replay or conflict with the other's stored record
