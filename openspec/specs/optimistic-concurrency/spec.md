# Optimistic Concurrency

## Purpose
Optimistic concurrency for versioned entities: clients send the expected version via If-Match, stale writes are rejected with 409, and successful writes bump the version.

## Requirements

### Requirement: Versioned entities carry an integer version
Every entity subject to optimistic concurrency SHALL carry an integer `version` column, and the entity's `version` MUST be included in read responses so clients can echo it back on update.

#### Scenario: Version is returned on read
- **WHEN** a client fetches a versioned entity
- **THEN** the response includes the entity's current integer `version`

### Requirement: Updates send the expected version via If-Match
Update requests to versioned entities SHALL carry the client's expected version in the `If-Match` header. The server MUST compare it to the stored version before applying any mutation.

#### Scenario: Matching version allows the write
- **WHEN** a client updates an entity with `If-Match` equal to the entity's stored `version`
- **THEN** the update is applied and succeeds

### Requirement: Stale writes are rejected with 409 STATE_CONFLICT
If the stored `version` differs from the value supplied in `If-Match`, the write MUST be rejected with HTTP 409 and error code `STATE_CONFLICT`, and no part of the mutation may be applied.

#### Scenario: Stale If-Match is rejected
- **WHEN** a client sends an update with `If-Match: 3` but the stored entity's version is 4
- **THEN** the response is 409 with code `STATE_CONFLICT` and the entity's data and version are unchanged

#### Scenario: Concurrent editors, second write loses
- **WHEN** two clients read version 2 and both submit updates with `If-Match: 2`, and the first update commits
- **THEN** the second update is rejected with 409 `STATE_CONFLICT` and the first client's changes are not overwritten

### Requirement: Successful writes increment the version by one
Each successfully applied update to a versioned entity MUST increment its `version` by exactly one, atomically with the mutation itself.

#### Scenario: Version increments on success
- **WHEN** an entity at version 5 is successfully updated
- **THEN** the stored entity's version becomes 6 and the update response reflects version 6

### Requirement: Missing or malformed If-Match is a validation error
Where an update endpoint requires optimistic concurrency, a request with a missing `If-Match` header or one that is not a non-negative integer MUST be rejected as a validation error (400 `VALIDATION_ERROR`), not treated as a conflict, and no mutation may be applied.

#### Scenario: Missing header
- **WHEN** a client sends an update to a version-guarded endpoint without an `If-Match` header
- **THEN** the response is 400 with code `VALIDATION_ERROR` and the entity is unchanged

#### Scenario: Malformed header
- **WHEN** a client sends `If-Match: abc` to a version-guarded endpoint
- **THEN** the response is 400 with code `VALIDATION_ERROR` and the entity is unchanged
