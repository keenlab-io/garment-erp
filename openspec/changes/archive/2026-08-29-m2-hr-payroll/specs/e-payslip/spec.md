## ADDED Requirements

### Requirement: Encrypted e-payslip generation
The system SHALL generate each payslip as a PDF via an asynchronous job that renders the
document (`PdfService`), **password-encrypts** it per employee (default password derived
from the national ID, configurable), stores it via `StorageService`, sets `payslip.pdf_key`,
and emits `PayslipGenerated`. Generation MUST be idempotent per payslip.

#### Scenario: Payslip PDF is encrypted and stored
- **WHEN** the payslip generation job runs for a payslip
- **THEN** a password-protected PDF is stored via `StorageService` and `pdf_key` is set on the payslip
- **AND** a `PayslipGenerated` event is emitted

#### Scenario: Opening the PDF requires the password
- **WHEN** the stored payslip PDF is opened without the configured password
- **THEN** the document cannot be read

### Requirement: Payslip download via signed URL
`GET /api/v1/payslips/{id}/pdf` SHALL return a 302 redirect to a signed URL that expires.
Access MUST be limited to the employee themselves (self) or a user with `hr.payslip.view`;
anyone else MUST be rejected with 403.

#### Scenario: Authorized download returns an expiring signed URL
- **WHEN** the employee (self) or a `hr.payslip.view` holder requests their payslip PDF
- **THEN** the response is a 302 to a signed URL that expires after a bounded time

#### Scenario: Unauthorized download is rejected
- **WHEN** a user who is neither the employee nor a `hr.payslip.view` holder requests the payslip
- **THEN** the request is rejected with 403 FORBIDDEN
