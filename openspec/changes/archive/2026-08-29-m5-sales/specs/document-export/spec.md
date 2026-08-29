## ADDED Requirements

### Requirement: Multi-format document export
`GET /api/v1/invoices/{id}/export?format=pdf|xlsx|jpg` SHALL enqueue an asynchronous export
job and respond **202** with a `job_id`. PDF is rendered via the shared PDF service, Excel via
`exceljs`, and JPG via a puppeteer screenshot of the same rendered document. The WHT
certificate (`GET /api/v1/invoices/{id}/wht-certificate`) SHALL likewise be produced as a
202 async job.

#### Scenario: Export returns an async job handle
- **WHEN** an invoice export is requested in a supported format
- **THEN** the request is accepted with 202 and a `job_id`, and the document is rendered off the request path

#### Scenario: WHT certificate is produced asynchronously
- **WHEN** a WHT certificate is requested for an invoice that has withholding
- **THEN** the request is accepted with 202 and the certificate is rendered by a job

### Requirement: Template customization
Documents SHALL render through a `document_template` holding a `layout` (jsonb) plus logo,
signature, and stamp asset keys resolved via the storage service.

#### Scenario: Documents render with the configured template assets
- **WHEN** a document is rendered
- **THEN** it uses the active `document_template`'s layout and its logo/signature/stamp assets

### Requirement: PromptPay QR
`GET /api/v1/invoices/{id}/promptpay-qr` SHALL return an EMVCo PromptPay payload and a QR
image generated from the configured PromptPay ID and the invoice amount, and the QR SHALL be
embedded onto the invoice PDF.

#### Scenario: PromptPay QR is generated for an invoice
- **WHEN** the PromptPay QR is requested for an invoice
- **THEN** an EMVCo payload and QR image encoding the PromptPay ID and the invoice amount are returned

#### Scenario: The QR appears on the invoice PDF
- **WHEN** the invoice PDF is rendered
- **THEN** the PromptPay QR image is embedded on it
