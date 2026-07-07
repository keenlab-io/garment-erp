# Object Storage

## Purpose
An S3/MinIO-compatible client for object upload, deletion, and time-limited presigned download URLs, configured from validated environment.

## Requirements

### Requirement: S3-compatible client with path-style addressing
The system SHALL provide a storage service backed by an AWS SDK v3 S3 client that supports S3-compatible servers (MinIO in development) by configuring a custom `endpoint` with `forcePathStyle` enabled, and the client MUST always be supplied a region even when targeting MinIO.

#### Scenario: Client works against MinIO
- **WHEN** the storage service is configured with the MinIO endpoint and `forcePathStyle: true`
- **THEN** object operations succeed against MinIO using path-style URLs (`http://endpoint/bucket/key`)

#### Scenario: Region always supplied
- **WHEN** the S3 client is constructed for a MinIO endpoint
- **THEN** a region value from configuration is passed to the client and construction does not fail for lack of a region

### Requirement: Object upload
The storage service SHALL provide a `put` operation that uploads an object (body plus key, with content type) to the configured bucket.

#### Scenario: Upload an object
- **WHEN** a caller invokes `put` with a key and object body
- **THEN** the object is stored in the configured bucket under that key and can subsequently be retrieved

### Requirement: Time-limited presigned download URLs
The storage service SHALL provide a `getSignedUrl` operation that returns a presigned download URL for an object, valid only for a limited expiry period.

#### Scenario: Presigned URL grants temporary access
- **WHEN** a caller requests a signed URL for an existing object
- **THEN** the returned URL downloads the object without further credentials while the URL is unexpired

#### Scenario: Expired URL is rejected
- **WHEN** a presigned URL is used after its expiry period has elapsed
- **THEN** the storage server rejects the request

### Requirement: Object deletion
The storage service SHALL provide a `delete` operation that removes an object from the configured bucket by key.

#### Scenario: Delete an object
- **WHEN** a caller invokes `delete` with the key of a stored object
- **THEN** the object is removed and subsequent download attempts for that key fail

### Requirement: Storage configuration from validated environment
Storage configuration (endpoint, bucket, access credentials, region, and the force-path-style flag) MUST be read from environment variables that are validated at application boot.

#### Scenario: Valid configuration at boot
- **WHEN** the application boots with all required `S3_*` environment variables set
- **THEN** the storage service initializes using those values

#### Scenario: Missing configuration fails fast
- **WHEN** a required storage environment variable is missing or invalid
- **THEN** environment validation fails at boot with an error identifying the variable, and the application does not start
