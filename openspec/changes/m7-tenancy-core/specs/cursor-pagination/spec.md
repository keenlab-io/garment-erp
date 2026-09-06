## MODIFIED Requirements

### Requirement: Opaque base64url cursor codec
Cursors SHALL be opaque base64url-encoded tokens produced and consumed by a shared codec
(`encodeCursor`/`decodeCursor` in `@erp/utils`). Clients MUST NOT be required to
understand cursor contents, and the encoded payload SHALL round-trip losslessly through
encode then decode. A cursor is a position marker, **not a capability**: it carries no
tenant authority, and a cursor minted in one tenant, when replayed by a caller of
another tenant, MUST disclose nothing — the query it seeds still runs entirely under the
caller's Row-Level Security scope and returns only the caller-tenant's rows (typically
an empty or unrelated page, never an error that reveals the cursor's origin).

#### Scenario: Cursor round-trips
- **WHEN** a payload is passed through `encodeCursor` and the result through `decodeCursor`
- **THEN** the decoded value deep-equals the original payload and the encoded token contains only base64url characters

#### Scenario: Foreign-tenant cursor replay leaks nothing
- **WHEN** a tenant-B caller supplies a syntactically valid cursor originally issued to tenant A
- **THEN** the response contains only tenant B rows (possibly none) positioned after the cursor's sort key
- **AND** no tenant A data, id, or existence signal appears in the response
