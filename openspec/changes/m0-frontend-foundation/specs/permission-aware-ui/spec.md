# permission-aware-ui

## ADDED Requirements

### Requirement: Permission strings come only from the contracts catalog
All UI permission gating SHALL use the `Permission` type, `PERMISSIONS` catalog, and `isPermission` guard exported by `@erp/contracts` — the exact strings the API guards enforce. Permission codes MUST NOT be re-declared, string-literal-typed as plain `string`, or duplicated anywhere in `@erp/ui` or `apps/web`; a typo in a gate is a compile error.

#### Scenario: Typo fails the build
- **WHEN** a component gates on `"sales.document.vodi"` (a code not in the catalog)
- **THEN** TypeScript rejects it because the value is not assignable to `Permission`

#### Scenario: One source for web and api
- **WHEN** a permission code is renamed in `packages/contracts/src/permissions/catalog.ts`
- **THEN** every UI gate referencing the old code becomes a compile error in the same change

### Requirement: Shared gating hooks and components
`@erp/ui` SHALL expose the gating layer every module reuses: a `usePermissions()` hook (reads the session context; returns `has(permission)` with super-admin bypass mirroring the backend) and a `<HasPermission required={...}>` component with `fallback` support. All foundation surfaces (nav, palette, table actions, fields) gate through this one layer — modules never hand-roll permission checks.

#### Scenario: Hook reflects the session set
- **WHEN** the session context contains `["inventory.issue.manage"]`
- **THEN** `has("inventory.issue.manage")` is true and `has("sales.invoice.create")` is false

#### Scenario: Super-admin bypass
- **WHEN** the session user is a super admin with an empty permission set
- **THEN** `has(...)` returns true for every catalog permission, matching backend guard semantics

### Requirement: Absent versus disabled
Module-level entry points (nav items, palette entries) the user lacks SHALL be **absent** from the UI. In-context actions a user could reasonably expect inside a screen they can access SHALL instead render **disabled with a tooltip naming the required permission** (e.g. "Requires sales.document.void") — recognition over recall, without teasing locked modules.

#### Scenario: In-context action disabled with named permission
- **WHEN** a user with document-view access but without `sales.document.void` views a document's actions
- **THEN** the Void action renders disabled, and its tooltip contains the literal permission code `sales.document.void`

#### Scenario: Module entry absent
- **WHEN** the same user lacks all `hr.*` permissions
- **THEN** no HR entry exists in nav or palette (absent, not disabled)

### Requirement: Field-level masking
A `MaskedValue` component SHALL render sensitive figures as `••••` with a lock icon when the viewer lacks the gating permission (`hr.salary.view` for salary fields, `inventory.cost.view` for cost/valuation fields, and any future field gates). The masked field occupies the same layout slot as the real value (stable layout), exposes an accessible description that access is restricted, and MUST NOT place the real value anywhere in the DOM when masked.

#### Scenario: Cost masked but stock visible
- **WHEN** a user without `inventory.cost.view` opens an item view containing on-hand qty and average cost
- **THEN** the on-hand qty renders normally while the cost renders as `••••` with a lock icon, and the cost value string appears nowhere in the DOM

#### Scenario: Layout is stable under masking
- **WHEN** the same screen is viewed by users with and without the permission
- **THEN** field positions and dimensions are identical; only the value/mask differs

### Requirement: Guarded-action confirmation flows
Actions the specs designate as guarded — force-logout, role delete, document void, stock adjustment, payroll approve — SHALL open the shared Confirm dialog configured with: explicit consequence text including the affected record id, a **required reason** where the backend requires one, and a **re-auth password** where specified (super-admin actions). The confirming control is permission-gated in addition to the dialog.

#### Scenario: Void requires reason and states consequence
- **WHEN** a permitted user triggers Void on an invoice
- **THEN** the confirm dialog names the invoice number in its consequence text and blocks confirmation until a non-blank reason is entered

#### Scenario: Force-logout requires re-auth
- **WHEN** a super admin triggers force-logout on a user
- **THEN** the confirm dialog requires a password entry before the confirming action is enabled
