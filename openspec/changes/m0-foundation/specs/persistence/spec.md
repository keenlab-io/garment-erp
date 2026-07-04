## ADDED Requirements

### Requirement: Framework-agnostic database package
The system SHALL provide a workspace package `@erp/db` containing the drizzle schema, Postgres client factory, and migration/seed runners. The package MUST be importable without booting NestJS (e.g. by drizzle-kit, migration scripts, and integration tests), and MUST NOT import `@erp/contracts` or any `@nestjs/*` package. Its runtime dependencies SHALL be limited to `drizzle-orm`, `postgres`, `@erp/utils`, and `argon2` (seed only). This boundary MUST be enforced by an ESLint rule so a violation fails lint.

#### Scenario: Schema usable without NestJS
- **WHEN** a script (drizzle-kit, migrate runner, or integration test) imports the schema and client from `@erp/db`
- **THEN** the import resolves and executes without any NestJS module being loaded

#### Scenario: Forbidden import fails lint
- **WHEN** a source file inside `@erp/db` imports `@erp/contracts` or a `@nestjs/*` package
- **THEN** `pnpm lint` reports a dependency-boundary violation and fails

### Requirement: Shared column conventions
`@erp/db` SHALL export reusable column builders that every table uses instead of redefining columns:
- `auditColumns`: `id` (uuid primary key defaulting to `gen_random_uuid()`), `createdAt`/`updatedAt` (timestamptz, not null, default now), `createdBy`/`updatedBy` (uuid, FK to `user.id` declared per-table, not inside `auditColumns`), and `deletedAt` (nullable timestamptz) for soft delete.
- `versionColumn`: an integer `version` column, not null, default 0, for optimistic concurrency.
- Numeric helpers: `money` = numeric(18,4), `qty` = numeric(18,6), `rate` = numeric(9,6).
- `citext`: a custom type mapping to the Postgres `citext` type for case-insensitive unique text.
- `notDeleted(deletedAt)`: a predicate helper equivalent to `deleted_at IS NULL` for filtering soft-deleted rows.

#### Scenario: Table composed from shared columns
- **WHEN** a module defines a table spreading `auditColumns` and `versionColumn`
- **THEN** the created table has `id` uuid primary key with a generated default, `created_at`/`updated_at` timestamptz defaults, nullable `created_by`/`updated_by`/`deleted_at`, and an integer `version` defaulting to 0

#### Scenario: Soft-deleted rows excluded by predicate
- **WHEN** a query filters with `notDeleted(table.deletedAt)`
- **THEN** rows whose `deleted_at` is set are excluded and rows with `deleted_at IS NULL` are returned

#### Scenario: Case-insensitive uniqueness via citext
- **WHEN** a row exists with a citext-unique value `Admin` and an insert is attempted with `admin`
- **THEN** the insert is rejected by the unique constraint

### Requirement: Numeric values cross the boundary as strings
All `money`, `qty`, and `rate` columns MUST be read from and written to the database as strings; floating-point numbers MUST NOT be used for these values anywhere in the persistence layer. The Postgres driver configuration SHALL return `numeric` values as strings, matching the wire contract's `moneyString`/`qtyString` convention.

#### Scenario: Numeric read returns a string
- **WHEN** a row with a money column value `19.5000` is selected through the `@erp/db` client
- **THEN** the value is returned as the string `"19.5000"`, not a JavaScript number

#### Scenario: Numeric write accepts a string
- **WHEN** a money value is written as the string `"1234.5678"`
- **THEN** the row stores numeric(18,4) `1234.5678` with no floating-point conversion in between

### Requirement: snake_case column mapping
The schema SHALL declare columns with camelCase keys and map them to snake_case database column names via `casing: "snake_case"`, configured in BOTH `drizzle.config.ts` (for migration generation) and the runtime `drizzle(...)` client (for queries), so the two never disagree.

#### Scenario: camelCase key maps to snake_case column
- **WHEN** a table declares a column with the key `permissionsVersion`
- **THEN** generated migrations and runtime queries both address the database column `permissions_version`

### Requirement: Postgres client factory
`@erp/db` SHALL export `createDb(url, options?)` returning `{ db, queryClient }`, where `db` is a drizzle instance bound to the full schema with snake_case casing and `queryClient` is the underlying postgres.js client (so callers can end the pool). The `db` MUST support transactions via `db.transaction(...)`, and the package SHALL export `Db` and `Tx` types for consumers.

#### Scenario: Client created from a URL
- **WHEN** `createDb(DATABASE_URL)` is called
- **THEN** it returns a `db` that can execute schema-typed queries and a `queryClient` whose `end()` closes the connection pool

#### Scenario: Transactional execution
- **WHEN** a callback passed to `db.transaction` throws
- **THEN** all statements executed inside the callback are rolled back

### Requirement: Platform table — user
`@erp/db` SHALL define a `user` table owned by M0 that other modules extend and MUST NOT redefine. It SHALL contain: `username` and `email` as citext with unique constraints, `passwordHash`, `status` typed as `UserStatus` with default `PENDING`, `permissionsVersion` (integer, default 1), `isSuperAdmin` (boolean), `failedLoginCount`, `lockedUntil`, `lastLoginAt`, plus the shared audit columns and `version` column.

#### Scenario: New user defaults
- **WHEN** a user row is inserted with only `username`, `email`, and `passwordHash`
- **THEN** the row has `status = 'PENDING'`, `permissions_version = 1`, `version = 0`, and a generated uuid `id`

#### Scenario: Duplicate email rejected case-insensitively
- **WHEN** a user exists with email `Ops@example.com` and another insert uses `ops@example.com`
- **THEN** the unique constraint rejects the insert

### Requirement: Platform table — session
`@erp/db` SHALL define a `session` table with: `userId` (FK to `user.id`), `tokenId` (the JWT jti), `permissionsVersion` (snapshot at issuance), `ip` (inet), `userAgent`, `expiresAt`, and `revokedAt`. A partial index SHALL exist on active sessions (`WHERE revoked_at IS NULL`) so active-session lookups do not scan revoked rows.

#### Scenario: Active-session lookup uses the partial index
- **WHEN** the migration for `session` is applied
- **THEN** the database contains an index on `session` restricted to `revoked_at IS NULL`

#### Scenario: Session records issuance context
- **WHEN** a session row is inserted at login
- **THEN** it stores the user's id, the token jti, the permissions-version snapshot, the client ip and user agent, and the expiry timestamp, with `revoked_at` null

### Requirement: Platform tables — audit_log, document_sequence, idempotency_key
`@erp/db` SHALL define three further platform tables:
- `audit_log` per spec §1.2 (append-only behavior is specified by the `audit-log` capability; this capability only owns the table definition and its migration).
- `document_sequence` per spec §0.6 with a unique constraint on `(key, year_scope)` (consumption semantics are specified by the `document-sequencing` capability).
- `idempotency_key` with composite primary key `(key, user_id)` and columns `requestHash`, `responseStatus`, `responseBody` (jsonb), `expiresAt`.

#### Scenario: Idempotency key uniqueness is per user
- **WHEN** two different users store an idempotency record with the same `key`
- **THEN** both rows are accepted, and a second row for the same `(key, user_id)` pair is rejected by the primary key

#### Scenario: Platform tables exist after migration
- **WHEN** all committed migrations are applied to an empty database
- **THEN** the tables `user`, `session`, `audit_log`, `document_sequence`, and `idempotency_key` all exist

### Requirement: Migrations
Migrations SHALL be generated by drizzle-kit from the compiled schema output (`dist/schema/index.js`, built before generation) and committed to `tooling/drizzle` at the repository root. The first migration MUST create the required Postgres extensions `pgcrypto` and `citext` before any table that depends on them. `@erp/db` SHALL provide a migration runner (`db:migrate`) that applies the committed migrations using the postgres.js migrator, and generation/migration/seed scripts SHALL be exposed from the repo root.

#### Scenario: Migrations apply on an empty database
- **WHEN** `db:migrate` is run against a fresh Postgres database
- **THEN** all migrations apply in order without error, with the `pgcrypto` and `citext` extensions created before their first use

#### Scenario: Migration generation is deterministic
- **WHEN** `db:generate` is run with no schema changes since the last committed migration
- **THEN** no new migration file is produced

### Requirement: Idempotent development seed
`@erp/db` SHALL provide a seed script (`db:seed`) that is safe to run repeatedly: it SHALL upsert a super-admin user whose password is hashed with argon2id, and insert the base `document_sequence` rows using `onConflictDoNothing`. Running the seed twice MUST NOT create duplicates or fail.

#### Scenario: Seed runs twice without error
- **WHEN** `db:seed` is executed twice against the same database
- **THEN** the second run completes successfully and exactly one super-admin user and one row per base document-sequence key exist

#### Scenario: Super-admin password is argon2id
- **WHEN** the seeded super-admin row is inspected
- **THEN** its `password_hash` is an argon2id hash, never a plaintext or reversible value

### Requirement: Enum parity with contracts
Because `@erp/db` must not import `@erp/contracts`, enum-typed columns SHALL use string-union `$type` declarations duplicated in `@erp/db` (e.g. `UserStatus`, `AuditAction`). Parity between the `@erp/db` unions and the `@erp/contracts` enums MUST be verified by a compile-time type test so any drift fails the test suite.

#### Scenario: Enum drift is caught
- **WHEN** a value is added to a `@erp/contracts` enum without updating the matching `@erp/db` string union (or vice versa)
- **THEN** the enum-parity type test fails
