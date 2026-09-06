## MODIFIED Requirements

### Requirement: Unique monotonic document numbers per key
The system SHALL provide a sequence service whose `next(key)` returns a formatted
document number for the given sequence key, **scoped to the current tenant**. Within a
`(tenant, key)` pair (and, when yearly reset is enabled, within a year scope),
successive calls MUST return strictly increasing sequence values with no duplicates.
Each call SHALL persist the incremented `current_value` in the tenant's
`document_sequence` row within a transaction, so a number is never handed out twice
inside a tenant. Document numbers are NOT unique across tenants: two tenants
independently issue `INV-2026-0001`, and no code may assume global doc-number
uniqueness.

#### Scenario: Sequential numbers for one key
- **WHEN** `next("SO")` is called three times in succession by the same tenant
- **THEN** the returned numbers carry sequence values n, n+1, n+2 with no gaps or repeats among the returned values

#### Scenario: Independent keys do not interfere
- **WHEN** `next("SO")` and `next("PO")` are each called by the same tenant
- **THEN** each key increments its own `current_value` and neither call affects the other key's sequence

#### Scenario: Tenants number independently
- **WHEN** tenant A has issued six invoices and tenant B calls `next("invoice")` for the first time
- **THEN** tenant B's number renders sequence 1, unaffected by tenant A's counter

### Requirement: Race safety under concurrency
`next(key)` MUST be safe under concurrent callers: it SHALL run inside a tenant-scoped
database transaction and lock the single `document_sequence` row for the caller-tenant's
key with `SELECT ... FOR UPDATE` before reading and incrementing `current_value` —
Row-Level Security restricts the locked scan to the caller's tenant, and the service
adds an explicit `tenant_id` predicate for index use — so concurrent transactions
serialize per `(tenant, key)` and can never observe the same value. Two tenants
incrementing the same key MUST NOT contend on each other's row locks.

#### Scenario: Zero duplicates under concurrent load
- **WHEN** 50 callers of one tenant invoke `next("SO")` concurrently
- **THEN** all 50 calls succeed and the 50 returned document numbers are all distinct

#### Scenario: Cross-tenant calls do not serialize on each other
- **WHEN** tenant A and tenant B each call `next("invoice")` at the same moment
- **THEN** each locks only its own `(tenant_id, key)` row and neither waits on the other

### Requirement: Single row per key
The `document_sequence` table SHALL hold exactly one row per `(tenant_id, key)`,
enforced by the composite primary key `(tenant_id, key)` and the
`unique(tenant_id, key, year_scope)` constraint together with in-place rollover: a
yearly reset MUST update the existing row's `year_scope` rather than inserting a new
row, so the tenant-scoped select by key always returns exactly one row. Provisioning
seeds the standard sequence rows for each new tenant via `seedTenantDefaults`.

#### Scenario: Rollover does not create a second row
- **WHEN** a `resetYearly` sequence rolls over from 2025 to 2026 in one tenant
- **THEN** that tenant still has exactly one row for the key, now with `year_scope = 2026`

#### Scenario: Lookup by key is unambiguous within a tenant
- **WHEN** the service selects the `document_sequence` row by key inside a tenant-scoped transaction
- **THEN** exactly one row is returned regardless of how many yearly rollovers have occurred or how many other tenants share the key
