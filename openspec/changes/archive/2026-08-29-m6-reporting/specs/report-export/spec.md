## ADDED Requirements

### Requirement: Asynchronous report export
`POST /api/v1/reports/{report_key}/export` `{ format, params }` SHALL enqueue an export job and
respond **202** with a `job_id`. The job renders the report in the requested format — Excel via
a spreadsheet library, CSV via native streaming, PDF via the shared HTML→PDF renderer — stores
the result via the storage service, and emits `ReportGenerated`. Large result sets SHALL stream
rather than buffer whole.

#### Scenario: Export returns an async job handle
- **WHEN** a report export is requested in a supported format
- **THEN** the request is accepted with 202 and a `job_id`, and the file is rendered off the request path

### Requirement: Export status and signed-URL retrieval
`GET /api/v1/exports/{job_id}` SHALL return `{ status, file_url? }`, where `file_url` is a
time-limited signed URL to the stored file once the job has completed.

#### Scenario: Completed export exposes a signed download URL
- **WHEN** an export job has completed and its status is queried
- **THEN** the response reports a completed status and a signed `file_url` for the stored file

#### Scenario: Pending export reports status without a URL
- **WHEN** an export job is still running and its status is queried
- **THEN** the response reports a non-complete status and no `file_url`
