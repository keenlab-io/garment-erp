## MODIFIED Requirements

### Requirement: Stale writes are rejected with 409 STATE_CONFLICT
If the stored `version` differs from the value supplied in `If-Match`, the write MUST be
rejected with HTTP 409 and error code `STATE_CONFLICT`, and no part of the mutation may
be applied. This applies only to entities visible in the caller's tenant: an `If-Match`
write targeting an id that belongs to another tenant MUST surface as 404 NOT_FOUND —
under Row-Level Security the row simply does not exist for the caller — and MUST NOT
return 409, which would leak the existence and version state of a foreign tenant's
entity.

#### Scenario: Stale If-Match is rejected
- **WHEN** a client sends an update with `If-Match: 3` but the stored entity's version is 4
- **THEN** the response is 409 with code `STATE_CONFLICT` and the entity's data and version are unchanged

#### Scenario: Concurrent editors, second write loses
- **WHEN** two clients read version 2 and both submit updates with `If-Match: 2`, and the first update commits
- **THEN** the second update is rejected with 409 `STATE_CONFLICT` and the first client's changes are not overwritten

#### Scenario: Cross-tenant probe cannot distinguish versions
- **WHEN** tenant B sends an update with any `If-Match` value against an id belonging to tenant A
- **THEN** the response is 404 NOT_FOUND regardless of the supplied version
- **AND** no information about the entity's existence or version is disclosed
