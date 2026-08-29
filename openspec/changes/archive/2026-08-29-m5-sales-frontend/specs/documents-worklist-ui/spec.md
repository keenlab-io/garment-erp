## ADDED Requirements

### Requirement: Unified documents worklist
The worklist SHALL list quotations, invoices, and receipts in one Data Table with
document-lifecycle chips (Draft/Sent/Approved/Issued/Partial/Paid/Overdue/Void, Void shown
struck + muted), a color-coded aging column, filters by type/status/customer/date, and bulk
export.

#### Scenario: Lifecycle is legible at a glance
- **WHEN** the worklist is viewed
- **THEN** each document shows its lifecycle chip and aging, with void documents struck through and never deleted

### Requirement: Overdue and expired affordances
Overdue rows SHALL carry a subtle danger tint and a "send reminder" action; expired quotations
show an EXPIRED chip with a "duplicate to renew" action.

#### Scenario: Overdue row offers a reminder
- **WHEN** an invoice is overdue
- **THEN** its row is tinted danger and offers a send-reminder action
