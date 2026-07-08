## ADDED Requirements

### Requirement: Customer master
`POST /api/v1/customers` (perm `sales.customer.manage`) SHALL create a `customer` with
`name`, `tax_id`, `branch_code`, `addresses` (jsonb), and `credit_terms_days`. The customer is
the billing party referenced by quotations and invoices.

#### Scenario: Create a customer
- **WHEN** a customer is created with a tax id, branch code, addresses, and credit terms
- **THEN** the `customer` row is stored and returned with its generated id

### Requirement: Customer autocomplete search
`GET /api/v1/customers?search=` (perm `sales.customer.manage`) SHALL return customers matching
the search term (by name or tax id) for autocomplete, paginated.

#### Scenario: Search returns matching customers
- **WHEN** the customer list is requested with a search term
- **THEN** only customers matching the term (name or tax id) are returned, paginated
