## ADDED Requirements

### Requirement: Customer list, detail, and quick-create
The system SHALL provide a customer list, a customer detail (documents, aging), and a quick-create
flow, gated by `sales.customer.manage`. Quick-create captures the tax fields used by the document
autocomplete.

#### Scenario: Quick-create a customer
- **WHEN** a new customer is created inline
- **THEN** they are available for selection with their tax id, branch, and address

#### Scenario: Customer detail shows documents and aging
- **WHEN** a customer is opened
- **THEN** their documents and aging are shown
