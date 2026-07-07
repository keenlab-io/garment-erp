## ADDED Requirements

### Requirement: Standard pagination query parameters
List endpoints SHALL accept a shared pagination query consisting of `limit` and an optional opaque `cursor`. `limit` MUST be coerced from its string form, clamped to the range 1–100, and default to 50 when absent.

#### Scenario: Default limit
- **WHEN** a list endpoint is called with no `limit` parameter
- **THEN** the page contains at most 50 items

#### Scenario: Limit is clamped
- **WHEN** a list endpoint is called with `limit=500`
- **THEN** the effective page size is 100, and with `limit=0` the effective page size is 1

#### Scenario: Limit is coerced from a string
- **WHEN** a list endpoint is called with `limit=25` as a query-string value
- **THEN** it is parsed as the number 25 and the page contains at most 25 items

### Requirement: Standard paginated response shape
Every paginated list response MUST have the shape `{ data, next_cursor }`, where `data` is the array of items for the page and `next_cursor` is a string cursor for the next page or `null` when no further results exist.

#### Scenario: More results remain
- **WHEN** a list query matches more rows than the requested limit
- **THEN** the response contains `limit` items in `data` and a non-null `next_cursor` string

#### Scenario: Last page
- **WHEN** a list query returns the final page of results
- **THEN** `next_cursor` is `null`

#### Scenario: Following the cursor continues the listing
- **WHEN** a client passes a `next_cursor` from a previous response as the `cursor` parameter
- **THEN** the response contains the items immediately following the previous page

### Requirement: Opaque base64url cursor codec
Cursors SHALL be opaque base64url-encoded tokens produced and consumed by a shared codec (`encodeCursor`/`decodeCursor` in `@erp/utils`). Clients MUST NOT be required to understand cursor contents, and the encoded payload SHALL round-trip losslessly through encode then decode.

#### Scenario: Cursor round-trips
- **WHEN** a payload is passed through `encodeCursor` and the result through `decodeCursor`
- **THEN** the decoded value deep-equals the original payload and the encoded token contains only base64url characters

### Requirement: Malformed cursors are rejected as validation errors
A `cursor` value that cannot be decoded (not valid base64url or not valid encoded payload) MUST be rejected with HTTP 400 and error code `VALIDATION_ERROR`. The server MUST NOT crash and MUST NOT silently return the first page for a malformed cursor.

#### Scenario: Garbage cursor
- **WHEN** a list endpoint is called with `cursor=!!!not-a-cursor`
- **THEN** the response is 400 with code `VALIDATION_ERROR` and a `details` entry identifying the `cursor` field

### Requirement: Stable deterministic ordering across pages
Each paginated listing MUST apply a defined total ordering (its sort key plus a unique tiebreaker) and derive cursors from that ordering, so that iterating pages with unchanged data never skips a row and never returns the same row on two pages.

#### Scenario: Full iteration is exact
- **WHEN** a client pages through an unchanged dataset of 120 rows with `limit=50` until `next_cursor` is `null`
- **THEN** exactly 120 distinct rows are returned across the three pages, with no duplicates and no omissions

#### Scenario: Rows with equal sort values are not duplicated
- **WHEN** multiple rows share the same value of the primary sort column across a page boundary
- **THEN** the unique tiebreaker in the cursor ensures each row appears on exactly one page
