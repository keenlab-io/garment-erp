## MODIFIED Requirements

### Requirement: Object upload
The storage service SHALL provide a `put` operation that uploads an object (body plus
key, with content type) to the configured bucket, storing it under the caller-tenant's
prefix: the effective key is `tenants/{tid}/{key}`, with `tid` taken from
`currentTenantId()`. `put` MUST throw when no tenant is in scope, and callers keep
passing relative keys — the prefix is applied inside `StorageService`, never by callers.

#### Scenario: Upload an object
- **WHEN** a caller in tenant A's scope invokes `put` with key `exports/report.xlsx`
- **THEN** the object is stored under `tenants/{A}/exports/report.xlsx` and can subsequently be retrieved by the same relative key from tenant A's scope

#### Scenario: Upload outside tenant scope fails
- **WHEN** `put` is invoked with no tenant context established
- **THEN** the call throws before any request reaches S3

### Requirement: Time-limited presigned download URLs
The storage service SHALL provide a `getSignedUrl` operation that returns a presigned
download URL for an object, valid only for a limited expiry period. Because a presigned
URL is a bearer capability that outlives the request, `getSignedUrl` MUST resolve the
caller's relative key against the current tenant's `tenants/{tid}/` prefix and verify
the resolved key carries that prefix **before** signing; a key resolving outside the
caller-tenant's prefix MUST be refused with no URL minted.

#### Scenario: Presigned URL grants temporary access
- **WHEN** a caller in tenant A's scope requests a signed URL for one of tenant A's objects
- **THEN** the returned URL downloads the object without further credentials while the URL is unexpired

#### Scenario: Foreign-tenant key is refused at mint time
- **WHEN** code running in tenant B's scope requests a signed URL whose key resolves under `tenants/{A}/`
- **THEN** `getSignedUrl` throws and no presigned URL is created

#### Scenario: Expired URL is rejected
- **WHEN** a presigned URL is used after its expiry period has elapsed
- **THEN** the storage server rejects the request

### Requirement: Object deletion
The storage service SHALL provide a `delete` operation that removes an object from the
configured bucket by key, resolved under the caller-tenant's `tenants/{tid}/` prefix
like `put` and `get` — so a tenant can only ever delete its own objects, and tenant
purge (m10) reduces to deleting the tenant's prefix.

#### Scenario: Delete an object
- **WHEN** a caller in tenant A's scope invokes `delete` with the relative key of one of tenant A's stored objects
- **THEN** the object under `tenants/{A}/…` is removed and subsequent download attempts for that key fail

#### Scenario: Delete cannot reach another tenant
- **WHEN** tenant B's scope invokes `delete` with any relative key
- **THEN** only keys under `tenants/{B}/` can be affected, regardless of the key's content
