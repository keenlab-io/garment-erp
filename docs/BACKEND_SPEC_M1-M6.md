# Backend Implementation Specification — Integrated Manufacturing & Sales ERP
### Modules M1–M6 · Implementation-Ready · v1.0

> Companion to *ERP Implementation Spec v1.0*. This document is the backend build contract: data model (PostgreSQL DDL), enums, state machines, invariants, domain events, REST endpoints with request/response schemas, background jobs, and acceptance criteria for every module.
>
> **Stack assumed:** NestJS (TypeScript) · PostgreSQL 15+ · Redis + BullMQ · S3/MinIO · Socket.IO. Architecture = Modular Monolith with an in-process domain event bus (see ADR-001).

---

## 0. Shared Conventions (apply to every module)

### 0.1 Identifiers & common columns
Every table includes:

```sql
id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
created_at    timestamptz NOT NULL DEFAULT now(),
updated_at    timestamptz NOT NULL DEFAULT now(),
created_by    uuid        REFERENCES "user"(id),
updated_by    uuid        REFERENCES "user"(id),
deleted_at    timestamptz NULL          -- soft delete; NULL = active
```

- **Primary keys** are UUID v4 (`gen_random_uuid()` via `pgcrypto`).
- **Human-facing codes** (employee `EXT0001`, item `AA00001`, document `QV20260001`) are separate columns issued by `SequenceService` (§0.6), never the PK.
- All queries filter `deleted_at IS NULL` unless explicitly auditing.

### 0.2 Money, quantity, and numeric rules
| Concept | Type | Notes |
|---|---|---|
| Money / price / amount | `NUMERIC(18,4)` | Never `float`/`double`. Round half-up at presentation only. |
| Quantity / weight | `NUMERIC(18,6)` | Supports 20.000000 kg, 1.500000 m. |
| Percentage / rate | `NUMERIC(9,6)` | Store `0.070000` for 7%, not `7`. |
| Over-the-wire (JSON) | `string` | Money/qty serialized as decimal strings to avoid JS float loss; parsed with a decimal lib server-side. |

### 0.3 Timestamps & localization
- Store all instants as `timestamptz` (UTC). Convert to `Asia/Bangkok` and B.E./A.D. at presentation.
- `date`-only business fields (e.g. `due_date`, `effective_date`) use `date`.

### 0.4 API conventions
- Base path `/api/v1`. Resources plural, kebab-case (`/goods-receipts`).
- **AuthN:** `Authorization: Bearer <JWT>`. JWT carries `sub`, `permissions_version`, `session_id`. Every request validates `permissions_version` against the user (§M1).
- **AuthZ:** endpoint guard checks a permission code (`module.resource.action`); field-level guards for PII/salary/cost.
- **Pagination:** cursor-based — `?limit=50&cursor=<opaque>`. Response: `{ data: [...], next_cursor: string|null }`.
- **Filtering/sort:** `?filter[status]=ISSUED&sort=-created_at`.
- **Idempotency:** side-effecting POSTs accept `Idempotency-Key` header; the server stores `(key, user_id) → response` for 24h.
- **Errors:** uniform shape, correct HTTP status.

```jsonc
// 4xx/5xx body
{ "code": "VALIDATION_ERROR", "message": "human readable", "details": [ { "field": "qty", "issue": "must be > 0" } ] }
```

| Status | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 202 | Accepted — async job queued, body `{ job_id }` |
| 400 | Validation error |
| 401 | Unauthenticated / stale `permissions_version` |
| 403 | Authenticated but lacks permission |
| 404 | Not found |
| 409 | State-machine / uniqueness / optimistic-lock conflict |
| 422 | Business-rule violation (e.g. insufficient stock) |

- **Optimistic concurrency:** mutable aggregates carry `version int`; client sends `If-Match: <version>`; mismatch → 409.

### 0.5 Domain event bus
- In-process (e.g. Nest `EventEmitter2` / CQRS bus). Events are past-tense facts; handlers run in the **same DB transaction** when they must be atomic (audit, backflush), or are dispatched to **BullMQ** when they may be async (email, LINE, PDF).
- Canonical envelope:

```jsonc
{ "event": "GoodsIssued", "version": 1, "occurred_at": "...", "actor_user_id": "...",
  "payload": { /* event-specific */ }, "correlation_id": "..." }
```

- Full catalog in §7.

### 0.6 SequenceService (document/code numbering)
Single service backing all running numbers. Issuance is **transactional with a row lock** (`SELECT ... FOR UPDATE`) or a Postgres sequence — never `max()+1`.

```sql
CREATE TABLE document_sequence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL,           -- 'EMPLOYEE' | 'ITEM' | 'QUOTATION_VAT' | 'INVOICE' ...
  prefix        text NOT NULL,           -- 'EXT' | 'AA' | 'QV' | 'QNV'
  include_year  boolean NOT NULL DEFAULT false,
  year_scope    int NULL,                -- current year bucket (for reset_yearly)
  padding       int NOT NULL DEFAULT 4,
  reset_yearly  boolean NOT NULL DEFAULT false,
  current_value bigint NOT NULL DEFAULT 0,
  format        text NOT NULL,           -- '{prefix}{yyyy}{seq:0000}'
  UNIQUE (key, year_scope)
);
```
`next(key) -> string`: lock row, (reset if `reset_yearly` and year changed), `current_value += 1`, render `format`.

### 0.7 Audit (cross-cutting)
Every mutation of a financial / stock / permission / document entity writes to `audit_log` (append-only, see §M1) via an interceptor subscribed to domain events. `reason` is mandatory for stock adjustment, document void, permission change, payroll approval.

---

## M1 — Access & Identity (IAM)

### 1.1 Responsibilities
Authentication, RBAC (users · roles · permissions · templates), session lifecycle with instant revocation, permission import, and the central audit log consumed by all modules.

### 1.2 Data model

```sql
CREATE TABLE "user" (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid NULL REFERENCES employee(id),    -- link to M2 (nullable: system accounts)
  username            citext NOT NULL UNIQUE,
  email               citext NOT NULL UNIQUE,
  password_hash       text   NOT NULL,                      -- argon2id
  status              text   NOT NULL DEFAULT 'PENDING',    -- enum user_status
  permissions_version int    NOT NULL DEFAULT 1,            -- bumped on any authz change
  is_super_admin      boolean NOT NULL DEFAULT false,
  failed_login_count  int    NOT NULL DEFAULT 0,
  locked_until        timestamptz NULL,
  last_login_at       timestamptz NULL,
  -- + common columns
  version             int NOT NULL DEFAULT 0
);

CREATE TABLE role (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  is_system   boolean NOT NULL DEFAULT false,   -- system roles cannot be deleted
  cloned_from uuid NULL REFERENCES role(id)
  -- + common columns
);

CREATE TABLE permission (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE     -- 'inventory.product.create' (module.resource.action)
);

CREATE TABLE role_permission (
  role_id       uuid NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permission(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_role (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES role(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_template (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   text NOT NULL UNIQUE,
  default_permission_ids uuid[] NOT NULL DEFAULT '{}'
);

CREATE TABLE session (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES "user"(id),
  token_id            text NOT NULL,            -- jti
  permissions_version int  NOT NULL,            -- snapshot at issue
  ip                  inet,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz NULL
);
CREATE INDEX ON session (user_id) WHERE revoked_at IS NULL;

CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at            timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES "user"(id),
  actor_role    text,
  action        text NOT NULL,        -- enum audit_action
  entity_type   text NOT NULL,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  ip            inet,
  user_agent    text
);
CREATE INDEX ON audit_log (entity_type, entity_id);
CREATE INDEX ON audit_log (actor_user_id, at);
-- audit_log is INSERT-only: REVOKE UPDATE, DELETE from app role.
```

### 1.3 Enums
```
user_status  = ACTIVE | INACTIVE | LOCKED | PENDING
audit_action = CREATE | UPDATE | DELETE | APPROVE | VOID | LOGIN | LOGOUT | PERMISSION_CHANGE | FORCE_LOGOUT
```

### 1.4 Session & auth lifecycle
```
login  -> issue JWT(jti, permissions_version) + create session
request-> verify JWT sig + session not revoked + JWT.permissions_version == user.permissions_version
            mismatch => 401 (forces re-login)
authz change (role/permission edit, force-logout) -> user.permissions_version += 1
            => all existing JWTs invalid on next request
logout / force-logout -> session.revoked_at = now()
lockout: failed_login_count >= 5 -> locked_until = now()+15m, status stays but auth refused
```

### 1.5 Business rules & invariants
- **Effective permissions** = union of permissions across the user's roles; `is_super_admin` bypasses all checks.
- **Delete role:** requires `iam.role.manage` **and** Super Admin re-authentication (password re-entered in the request); rejected (409) if any user is still bound to the role.
- **Clone role:** deep-copies `role_permission` into a new role with `cloned_from` set; editable thereafter.
- **Lower/change permissions or force-logout** ⇒ bump `permissions_version` (the single mechanism behind instant revocation; ADR-006).
- **Excel import:** validates every permission code against `permission.code`; unknown codes → 400 with the offending rows; import is all-or-nothing (one transaction).
- Password hashed with argon2id; password policy + lockout enforced; never logged.

### 1.6 Domain events
Emitted: `UserLoggedIn`, `PermissionsChanged{user_id, new_version}`, `SessionRevoked`, `RoleDeleted`.
Consumed: none (M1 is the root); the audit interceptor consumes events from **all** modules.

### 1.7 API endpoints

**Auth**
```
POST /api/v1/auth/login            body { username, password }            -> 200 { access_token, refresh_token, expires_in }
POST /api/v1/auth/refresh          body { refresh_token }                 -> 200 { access_token, ... }
POST /api/v1/auth/logout           (auth)                                 -> 204
GET  /api/v1/auth/me               (auth)                                 -> 200 { user, roles, permissions[] }
```

**Roles & permissions** (perm: `iam.role.manage`)
```
GET    /api/v1/roles                                  -> 200 [ { id, name, permission_count, user_count } ]
POST   /api/v1/roles                body { name, description, permission_codes[] }   -> 201 { role }
PUT    /api/v1/roles/{id}           body { name?, description?, permission_codes[]? } -> 200 { role }  (bumps versions of affected users)
POST   /api/v1/roles/{id}/clone     body { name }                        -> 201 { role }
DELETE /api/v1/roles/{id}           body { super_admin_password }         -> 204 | 409 (users bound) | 403 (bad password)
GET    /api/v1/permissions                                               -> 200 [ { code } ]   (catalog)
POST   /api/v1/role-templates       body { name, permission_codes[] }    -> 201
```

**Users** (perm: `iam.user.manage`)
```
GET    /api/v1/users?filter[status]=ACTIVE&limit=50&cursor=  -> 200 { data, next_cursor }
POST   /api/v1/users                body { employee_id?, username, email, role_ids[], temp_password }  -> 201
PUT    /api/v1/users/{id}/roles     body { role_ids[] }      -> 200   (bumps permissions_version)
POST   /api/v1/users/{id}/force-logout   (perm iam.user.force_logout)  -> 204   (bumps version + revokes sessions)
POST   /api/v1/users/{id}/status    body { status }          -> 200
```

**Import & audit**
```
POST /api/v1/iam/import            multipart(excel)  (perm iam.role.manage)  -> 200 { imported, skipped[] } | 400
GET  /api/v1/audit?entity_type=&entity_id=&actor=&from=&to=&limit=  (perm iam.audit.view) -> 200 { data, next_cursor }
```

### 1.8 Acceptance criteria
- Changing an online user's roles ⇒ their next request returns 401 until re-login (verified via `permissions_version` mismatch).
- `DELETE /roles/{id}` without a valid `super_admin_password` ⇒ 403, no data change, no audit `DELETE` row.
- Deleting a role still bound to ≥1 user ⇒ 409.
- Every authz mutation writes one `audit_log` row with `action=PERMISSION_CHANGE`, populated `before`/`after`, actor, timestamp.
- 6 consecutive bad logins ⇒ account locked 15 min; correct password during lock ⇒ still refused.

---

## M2 — HR & Payroll

### 2.1 Responsibilities
Employee master & documents, org structure (department/position/reporting line), salary history, allowances/deductions, OT request→approval→reconciliation, cash advance with approval & auto-deduction, payroll run engine, encrypted e-payslips, and Thai statutory withholding (PND.1) + social security.

### 2.2 Data model

```sql
CREATE TABLE department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, parent_id uuid NULL REFERENCES department(id)
  -- + common columns
);
CREATE TABLE position (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, job_description text, department_id uuid NOT NULL REFERENCES department(id)
);

CREATE TABLE employee (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_code           text NOT NULL UNIQUE,          -- auto EXT0001
  first_name text NOT NULL, last_name text NOT NULL,
  national_id_enc    bytea,                          -- encrypted PII
  profile            jsonb NOT NULL DEFAULT '{}',    -- contact, emergency, bank acct (sensitive fields encrypted)
  position_id        uuid REFERENCES position(id),
  employment_type    text NOT NULL,                  -- enum
  status             text NOT NULL DEFAULT 'PROBATION',
  hire_date          date NOT NULL,
  probation_end_date date NULL,
  -- + common columns
  version int NOT NULL DEFAULT 0
);

CREATE TABLE reporting_line (
  employee_id         uuid PRIMARY KEY REFERENCES employee(id),
  manager_employee_id uuid REFERENCES employee(id)
);

CREATE TABLE employee_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee(id),
  type text NOT NULL,                 -- ID_CARD | CONTRACT | CERTIFICATE | OTHER
  file_key text NOT NULL,             -- object storage key (signed-URL access only)
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE salary_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee(id),
  base_salary numeric(18,4) NOT NULL,
  effective_date date NOT NULL,
  created_by uuid REFERENCES "user"(id), created_at timestamptz DEFAULT now()
);  -- history: current = latest effective_date <= today

CREATE TABLE pay_component (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,                 -- ALLOWANCE | DEDUCTION
  name text NOT NULL,
  default_amount numeric(18,4) NOT NULL DEFAULT 0,
  recurring boolean NOT NULL DEFAULT true
);
CREATE TABLE employee_pay_component (
  employee_id uuid REFERENCES employee(id),
  pay_component_id uuid REFERENCES pay_component(id),
  amount numeric(18,4) NOT NULL,
  PRIMARY KEY (employee_id, pay_component_id)
);

CREATE TABLE ot_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee(id),
  work_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
  reason text, rate_type text NOT NULL,     -- WEEKDAY_1_5 | HOLIDAY_3_0 | ... (config)
  approved_hours numeric(9,6) NULL,         -- set at reconciliation
  status text NOT NULL DEFAULT 'DRAFT',
  approver_id uuid NULL REFERENCES "user"(id),
  version int NOT NULL DEFAULT 0
);

CREATE TABLE cash_advance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employee(id),
  amount numeric(18,4) NOT NULL,
  reason text, status text NOT NULL DEFAULT 'SUBMITTED',
  approver_id uuid NULL REFERENCES "user"(id),
  repayment_plan jsonb,                     -- { mode: 'LUMP'|'INSTALLMENT', installments?: n }
  outstanding numeric(18,4) NOT NULL,
  version int NOT NULL DEFAULT 0
);

CREATE TABLE attendance (
  employee_id uuid REFERENCES employee(id),
  work_date date,
  clock_in timestamptz, clock_out timestamptz,
  source text NOT NULL DEFAULT 'IMPORT',
  PRIMARY KEY (employee_id, work_date)
);

CREATE TABLE payroll_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL,                      -- 'YYYY-MM'
  status text NOT NULL DEFAULT 'DRAFT',
  approved_by uuid NULL REFERENCES "user"(id),
  UNIQUE (period),
  version int NOT NULL DEFAULT 0
);
CREATE TABLE payslip (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES payroll_run(id),
  employee_id uuid NOT NULL REFERENCES employee(id),
  breakdown jsonb NOT NULL,                  -- { base, ot, allowances[], deductions[], sso, tax, advance }
  gross numeric(18,4) NOT NULL,
  net numeric(18,4) NOT NULL,
  pdf_key text NULL,                         -- encrypted PDF in object storage
  UNIQUE (run_id, employee_id)
);
```

### 2.3 Enums
```
employment_type   = DAILY | MONTHLY
employee.status   = PROBATION | ACTIVE | RESIGNED | SUSPENDED
ot_request.status = DRAFT | SUBMITTED | APPROVED | REJECTED | RECONCILED | PAID
cash_advance.status = SUBMITTED | APPROVED | REJECTED | DISBURSED | REPAYING | CLEARED
payroll_run.status  = DRAFT | CALCULATED | APPROVED | PAID | CLOSED
```

### 2.4 State machines
```
ot_request:   DRAFT -> SUBMITTED -> {APPROVED -> RECONCILED -> PAID | REJECTED}
cash_advance: SUBMITTED -(admin screens)-> APPROVED(super_admin) | REJECTED
              APPROVED -> DISBURSED -> REPAYING -> CLEARED
payroll_run:  DRAFT -> CALCULATED -> APPROVED -> PAID -> CLOSED   (no backward transitions)
```

### 2.5 Business rules & invariants
- **OT pay** = `approved_hours × hourly_rate × rate_multiplier`. `approved_hours` is the **min** of requested hours and actual attended hours (from `attendance`); rate multiplier resolved from `rate_type` config.
- **Cash-advance ceiling** configurable (e.g. ≤ 50% of base salary or by tenure); request must pass ceiling check at SUBMITTED. Approval requires Super Admin (M1 `is_super_admin`).
- **Net pay formula** (canonical):
  `net = (base + Σ allowances + ot_pay) − (sso + withholding_tax + advance_repayment + Σ other_deductions)`.
- **payroll_run.CALCULATED** snapshots every input into `payslip.breakdown` (immutable once APPROVED). Re-calculation only allowed while DRAFT/CALCULATED.
- On **APPROVED**, outstanding cash advances for the period are pulled into the deduction line automatically and `cash_advance.outstanding` decremented; `→ CLEARED` when zero.
- **e-Payslip**: PDF generated as async job, encrypted with a per-employee password (configurable, e.g. national ID); stored under `pdf_key`; downloadable only by the employee (self) or `hr.payslip.view`.
- **PII**: `national_id_enc` and bank fields encrypted at rest; `hr.salary.view` gates all monetary fields; access audited.
- **Probation alert**: scheduled job notifies managers N days before `probation_end_date`.
- Tax/SSO parameters are **configurable** (rates, ceilings) and **not authoritative** — flagged for accountant confirmation (see ERP spec §6.8).

### 2.6 Domain events
Emitted: `OTApproved`, `CashAdvanceApproved`, `CashAdvanceDisbursed`, `PayrollApproved{run_id, period}`, `PayslipGenerated`, `ProbationEnding`.
Consumed: `EmployeeCreated` (issues `emp_code`), attendance import events.

### 2.7 API endpoints
```
# Employees & org (perm hr.employee.*, salary fields gated by hr.salary.view)
GET  /api/v1/employees?filter[status]=&limit=&cursor=        -> { data, next_cursor }
POST /api/v1/employees        body { first_name,last_name,national_id,employment_type,position_id,hire_date,profile }  -> 201 { employee }  (emp_code auto)
GET  /api/v1/employees/{id}                                  -> { employee (salary fields omitted w/o perm) }
PUT  /api/v1/employees/{id}    (If-Match version)            -> 200
POST /api/v1/employees/{id}/documents   multipart           -> 201 { file_key }
POST /api/v1/employees/{id}/salary      body { base_salary, effective_date } (hr.salary.edit) -> 201
GET  /api/v1/departments | POST /api/v1/departments | /positions ...

# OT
POST /api/v1/ot-requests       body { employee_id, work_date, start_time, end_time, reason, rate_type } -> 201 (DRAFT)
POST /api/v1/ot-requests/{id}/submit                         -> 200 (SUBMITTED)
POST /api/v1/ot-requests/{id}/approve   (hr.ot.approve)      -> 200 (APPROVED)
POST /api/v1/ot-requests/{id}/reconcile body { approved_hours? } -> 200 (RECONCILED; defaults to min(req, attendance))

# Cash advance
POST /api/v1/cash-advances     body { employee_id, amount, reason, repayment_plan } -> 201 | 422 (over ceiling)
POST /api/v1/cash-advances/{id}/approve  (super_admin)       -> 200
POST /api/v1/cash-advances/{id}/disburse                     -> 200 (DISBURSED, outstanding=amount)

# Attendance import
POST /api/v1/attendance/import  multipart(excel|csv)         -> 200 { rows_imported }

# Payroll
POST /api/v1/payroll-runs       body { period }              -> 201 (DRAFT)
POST /api/v1/payroll-runs/{id}/calculate                     -> 202 { job_id }  (builds payslips)
GET  /api/v1/payroll-runs/{id}/payslips                      -> [ { employee_id, gross, net } ]
POST /api/v1/payroll-runs/{id}/approve  (hr.payroll.approve) -> 200 (APPROVED; pulls advances)
GET  /api/v1/payslips/{id}/pdf                               -> 302 signed-url (self or hr.payslip.view)
GET  /api/v1/payroll/exports/pnd1?period=  | /sso?period=    -> 202 { job_id } (file export)
```

### 2.8 Acceptance criteria
- OT requested 3h, attendance shows 2h ⇒ reconcile sets `approved_hours=2`, pay reflects 2h.
- An APPROVED payroll run auto-inserts each employee's outstanding advance into deductions; `net` equals the formula to the cent; advance `outstanding` decremented.
- A user lacking `hr.salary.view` gets employee records with all monetary fields omitted (not nulled-then-shown).
- Approving a payroll run twice ⇒ second call 409 (already APPROVED).
- Payslip PDF link returns a signed URL that expires; opening requires the configured password.

---

## M3 — Inventory & Costing

### 3.1 Responsibilities
Items (raw/finished/consumable), SKUs/variants, barcodes & lots, UOM conversion, **append-only stock ledger**, goods receipt (with landed cost), goods issue, BOM + roll-up, backflush from production, WIP, stock count/adjustment, and valuation/variance reporting inputs. This is the costing core (ADR-004).

### 3.2 Data model
```sql
CREATE TABLE uom (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, name text);
CREATE TABLE uom_conversion (
  item_id uuid NOT NULL REFERENCES item(id),
  from_uom uuid NOT NULL REFERENCES uom(id),
  to_uom   uuid NOT NULL REFERENCES uom(id),
  factor numeric(18,6) NOT NULL,           -- 1 from_uom = factor * to_uom
  PRIMARY KEY (item_id, from_uom, to_uom)
);

CREATE TABLE item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,               -- auto AA00001
  name text NOT NULL,
  item_type text NOT NULL,                 -- RAW | FINISHED | CONSUMABLE
  base_uom_id uuid NOT NULL REFERENCES uom(id),
  costing_method text NOT NULL DEFAULT 'MAV',  -- MAV | FIFO | STANDARD
  standard_cost numeric(18,4) NULL,        -- for STANDARD / variance baseline
  min_stock numeric(18,6) NULL,
  attributes jsonb NOT NULL DEFAULT '{}',
  -- + common columns
  version int NOT NULL DEFAULT 0
);

CREATE TABLE sku (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES item(id),
  sku_code text NOT NULL UNIQUE,
  variant jsonb NOT NULL DEFAULT '{}',     -- { color, size, collection }
  barcode text UNIQUE
);

CREATE TABLE warehouse (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);

CREATE TABLE stock_lot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES item(id),
  lot_no text NOT NULL, barcode text UNIQUE,
  supplier_id uuid NULL,
  qty_remaining numeric(18,6) NOT NULL,    -- in base_uom
  unit_cost numeric(18,4) NOT NULL,        -- landed unit cost
  received_at timestamptz NOT NULL DEFAULT now()
);

-- THE LEDGER: append-only, never UPDATE/DELETE
CREATE TABLE stock_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES item(id),
  sku_id uuid NULL REFERENCES sku(id),
  lot_id uuid NULL REFERENCES stock_lot(id),
  warehouse_id uuid NOT NULL REFERENCES warehouse(id),
  qty numeric(18,6) NOT NULL,              -- in base_uom; signed by direction
  direction text NOT NULL,                 -- IN | OUT | ADJUST
  unit_cost numeric(18,4) NOT NULL,
  ref_type text NOT NULL,                  -- GOODS_RECEIPT | GOODS_ISSUE | BACKFLUSH | ADJUSTMENT | COUNT
  ref_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON stock_movement (item_id, warehouse_id, at);

-- Optional performance snapshot (derived; rebuildable from ledger)
CREATE TABLE stock_balance (
  item_id uuid, warehouse_id uuid,
  qty_on_hand numeric(18,6) NOT NULL DEFAULT 0,
  avg_cost numeric(18,4) NOT NULL DEFAULT 0,   -- moving average
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE goods_receipt (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text UNIQUE, supplier_id uuid,
  status text NOT NULL DEFAULT 'DRAFT',
  landed_cost_total numeric(18,4) NOT NULL DEFAULT 0,
  alloc_method text NOT NULL DEFAULT 'VALUE',  -- VALUE | WEIGHT | QTY
  version int NOT NULL DEFAULT 0
);
CREATE TABLE goods_receipt_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES goods_receipt(id),
  item_id uuid NOT NULL REFERENCES item(id),
  qty numeric(18,6) NOT NULL, uom_id uuid NOT NULL REFERENCES uom(id),
  unit_price numeric(18,4) NOT NULL,
  allocated_landed numeric(18,4) NOT NULL DEFAULT 0
);

CREATE TABLE goods_issue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text UNIQUE, purpose text NOT NULL,   -- PRODUCTION | SALE | OTHER
  ref_wo_id uuid NULL, status text NOT NULL DEFAULT 'DRAFT'
);
CREATE TABLE goods_issue_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES goods_issue(id),
  item_id uuid NOT NULL REFERENCES item(id),
  qty numeric(18,6) NOT NULL, uom_id uuid NOT NULL REFERENCES uom(id)
);

CREATE TABLE bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finished_item_id uuid NOT NULL REFERENCES item(id),
  version int NOT NULL DEFAULT 1,
  conversion_cost numeric(18,4) NULL,      -- labor+overhead per unit (optional)
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (finished_item_id, version)
);
CREATE TABLE bom_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id uuid NOT NULL REFERENCES bom(id),
  raw_item_id uuid NOT NULL REFERENCES item(id),
  qty numeric(18,6) NOT NULL, uom_id uuid NOT NULL REFERENCES uom(id),
  scrap_pct numeric(9,6) NOT NULL DEFAULT 0
);

CREATE TABLE stock_count (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text, status text NOT NULL DEFAULT 'OPEN'
);
CREATE TABLE stock_count_line (
  count_id uuid REFERENCES stock_count(id), item_id uuid REFERENCES item(id),
  system_qty numeric(18,6) NOT NULL, counted_qty numeric(18,6),
  PRIMARY KEY (count_id, item_id)
);

CREATE TABLE stock_adjustment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason text NOT NULL,                    -- mandatory -> audit
  status text NOT NULL DEFAULT 'DRAFT', approved_by uuid NULL
);
CREATE TABLE stock_adjustment_line (
  adjustment_id uuid REFERENCES stock_adjustment(id),
  item_id uuid REFERENCES item(id), warehouse_id uuid REFERENCES warehouse(id),
  delta_qty numeric(18,6) NOT NULL, PRIMARY KEY (adjustment_id, item_id, warehouse_id)
);
```

### 3.3 Enums & state machines
```
item_type = RAW | FINISHED | CONSUMABLE          costing_method = MAV | FIFO | STANDARD
goods_receipt:    DRAFT -> CONFIRMED(+landed alloc) -> POSTED(ledger IN)
goods_issue:      DRAFT -> POSTED(ledger OUT)
stock_count:      OPEN -> COUNTING(lock item movement) -> RECONCILED -> ADJUSTED -> CLOSED
stock_adjustment: DRAFT -> APPROVED -> POSTED(ledger ADJUST)
```

### 3.4 Costing rules (implementable)
- **Moving Average (default):** on IN posting, `new_avg = (qty_on_hand*avg_cost + in_qty*in_unit_cost) / (qty_on_hand + in_qty)`. OUT uses current `avg_cost`.
- **FIFO:** OUT consumes `stock_lot` rows oldest-first, decrementing `qty_remaining`; movement `unit_cost` = consumed lot cost (split into multiple movements if spanning lots).
- **STANDARD:** OUT at `item.standard_cost`; difference vs actual feeds variance reporting.
- **Landed cost:** at receipt CONFIRM, allocate `landed_cost_total` across lines by `alloc_method`; each line's effective `unit_cost = unit_price + allocated_landed/qty`.
- **BOM roll-up:** recursive walk of `bom_line` × current cost (+ `scrap_pct`) + `conversion_cost`, summed bottom-up; pure read (no ledger writes).
- **Backflush:** on `WorkOrderCompleted` (from M4), in one transaction: post FG `IN` (qty produced, cost = rolled-up cost) and RM `OUT` per active BOM × produced qty at current cost. WIP value = sum of RM issued to the WO not yet flushed.

### 3.5 Invariants
- All quantities convert to `base_uom` (via `uom_conversion`) **before** writing the ledger.
- `stock_balance` is a derived cache: every ledger insert updates it in the same transaction; it must be reconstructable by replaying `stock_movement`.
- Ledger rows are immutable; corrections are new compensating movements, never edits.
- `stock_adjustment` without `reason` ⇒ rejected (400) before any state change.
- Issuing more than `qty_on_hand` (when negative stock disallowed by config) ⇒ 422.

### 3.6 Domain events
Emitted: `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`, `LowStockReached{item_id, on_hand, min}`, `BackflushPosted`.
Consumed: `WorkOrderCompleted` (M4 → backflush), `DeliveryNoteIssued` (M5 → optional stock OUT).

### 3.7 API endpoints
```
POST /api/v1/items   body { name, item_type, base_uom_id, costing_method, min_stock?, attributes } -> 201 (code auto)
POST /api/v1/items/{id}/skus  body { variant, barcode? }   -> 201 (sku_code auto)
POST /api/v1/barcodes/print   body { sku_ids[] | lot_ids[] }-> 202 { job_id } (label PDF)
POST /api/v1/uom-conversions  body { item_id, from_uom, to_uom, factor } -> 201

POST /api/v1/goods-receipts   body { supplier_id, lines[], landed_cost_total?, alloc_method? } -> 201 (DRAFT)
POST /api/v1/goods-receipts/{id}/confirm  -> 200 (allocates landed cost)
POST /api/v1/goods-receipts/{id}/post     -> 200 (writes ledger IN; creates lots) | 409

POST /api/v1/goods-issues     body { purpose, ref_wo_id?, lines[] } -> 201
POST /api/v1/goods-issues/{id}/post       -> 200 (ledger OUT) | 422 (insufficient)

POST /api/v1/boms             body { finished_item_id, lines[], conversion_cost? } -> 201
POST /api/v1/boms/{id}/rollup -> 200 { rolled_up_cost, breakdown[] }     (read-only simulation)

POST /api/v1/stock-counts     body { period, item_ids[] } -> 201 (OPEN, snapshots system_qty)
PUT  /api/v1/stock-counts/{id}/lines body { counts[] }    -> 200
POST /api/v1/stock-counts/{id}/reconcile -> 200 (creates draft adjustment for diffs)
POST /api/v1/stock-adjustments body { reason, lines[] }   -> 201 (DRAFT) | 400 (no reason)
POST /api/v1/stock-adjustments/{id}/approve -> 200 ; /post -> 200 (ledger ADJUST)

GET  /api/v1/reports/stock-card?item_id=&warehouse_id=&from=&to= -> { opening, movements[], closing }
GET  /api/v1/reports/valuation?as_of= | /low-stock | /dead-stock?months=3
```

### 3.8 Acceptance criteria
- Receive a 20kg roll, issue 5kg ⇒ lot `qty_remaining=15`, ledger has IN 20 and OUT 5, `stock_balance.qty_on_hand=15`.
- MAV: receive 10 @ ฿100 then 10 @ ฿120 ⇒ `avg_cost=110`; issuing 5 posts OUT at 110.
- Backflush on producing 100 FG ⇒ FG +100 and each RM −(bom_qty×100×(1+scrap)) at current cost, all in one transaction; failure rolls back fully.
- Replaying `stock_movement` for any item reproduces `stock_balance` exactly.
- Adjustment without reason ⇒ 400; with reason ⇒ one `audit_log` row capturing actor + reason + before/after.

---

## M4 — Production Tracking

### 4.1 Responsibilities
Routing templates & steps with standard times, work orders, per-step shop-floor scanning (start/finish → actual time & delay detection), defects, subcontracting with SLA, timeline/Gantt data, WIP/bottleneck inputs, and triggering backflush in M3 on completion.

### 4.2 Data model
```sql
CREATE TABLE routing_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, product_type text,        -- SUBLIMATION | DTF | DTG ...
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE routing_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES routing_template(id),
  seq int NOT NULL, name text NOT NULL,
  standard_time_min int NOT NULL DEFAULT 0,
  department_id uuid NULL REFERENCES department(id),
  UNIQUE (template_id, seq)
);

CREATE TABLE work_order (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no text NOT NULL UNIQUE,
  customer_id uuid NULL,                          -- M5 customer
  finished_item_id uuid NOT NULL REFERENCES item(id),
  qty numeric(18,6) NOT NULL,
  due_date date,
  routing_template_id uuid NOT NULL REFERENCES routing_template(id),
  machine text NULL, mockup_file_key text NULL,
  status text NOT NULL DEFAULT 'PENDING',
  version int NOT NULL DEFAULT 0
);

CREATE TABLE work_order_step (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES work_order(id),
  routing_step_id uuid NOT NULL REFERENCES routing_step(id),
  seq int NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  started_at timestamptz NULL, finished_at timestamptz NULL,
  assigned_to uuid NULL REFERENCES employee(id),
  machine text NULL,
  is_delayed boolean GENERATED ALWAYS AS (
    finished_at IS NOT NULL AND started_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (finished_at - started_at))/60 > 0  -- compared to standard in app/view
  ) STORED,
  UNIQUE (wo_id, routing_step_id)
);

CREATE TABLE production_scan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_step_id uuid NOT NULL REFERENCES work_order_step(id),
  action text NOT NULL,                           -- START | FINISH
  by_user uuid NOT NULL REFERENCES "user"(id),
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE defect (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_step_id uuid NOT NULL REFERENCES work_order_step(id),
  type text NOT NULL, qty numeric(18,6) NOT NULL, note text
);

CREATE TABLE subcontract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_step_id uuid NOT NULL REFERENCES work_order_step(id),
  vendor text NOT NULL, sla_due timestamptz, status text NOT NULL DEFAULT 'SENT'
);
```

### 4.3 Enums & state machines
```
work_order.status      = PENDING | IN_PROGRESS | COMPLETED | CANCELLED
work_order_step.status = PENDING | IN_PROGRESS | COMPLETED | HOLD | DEFECT | OUTSOURCED
subcontract.status     = SENT | OVERDUE | RECEIVED

WO:   PENDING -> IN_PROGRESS (first step START) -> COMPLETED (all steps COMPLETED) | CANCELLED
step: PENDING -> IN_PROGRESS (scan START) -> COMPLETED (scan FINISH)
              -> HOLD | DEFECT | OUTSOURCED -> back to IN_PROGRESS/COMPLETED
```

### 4.4 Business rules & invariants
- Creating a WO **materializes** `work_order_step` rows by copying the routing template's steps (seq, standard_time) — snapshot, so later template edits don't mutate live WOs.
- **Scan START** sets `started_at`, step→IN_PROGRESS, WO→IN_PROGRESS if first. **Scan FINISH** sets `finished_at`, step→COMPLETED. Scans are append-only facts; step timestamps derived from earliest START / latest FINISH.
- **Delay detection:** a step is delayed when `actual_minutes(started→finished, or now if running) > standard_time_min`. Computed in a view/service (the generated column above is a placeholder; the authoritative check compares against the step's `standard_time_min`). Delayed running steps emit `StepDelayed` for supervisor alerts.
- **Subcontract:** sending a step sets step→OUTSOURCED + `subcontract.status=SENT`; a scheduler flips to OVERDUE past `sla_due`; receiving sets RECEIVED and returns the step to the line.
- **Completion → backflush:** when the **last** step is COMPLETED, WO→COMPLETED and emit `WorkOrderCompleted{wo_id, finished_item_id, qty}`; M3 consumes it to backflush (FG IN, RM OUT). WO completion and backflush are correlated via `correlation_id`; backflush runs in its own transaction and is idempotent on `wo_id`.
- Re-scanning FINISH on a COMPLETED step ⇒ 409.

### 4.5 Domain events
Emitted: `WorkOrderCreated`, `WorkOrderStarted`, `StepStarted`, `StepFinished`, `StepDelayed`, `DefectRecorded`, `WorkOrderCompleted`, `SubcontractOverdue`.
Consumed: none required; reads item/BOM from M3, customer from M5.

### 4.6 API endpoints
```
POST /api/v1/routing-templates  body { name, product_type, steps:[{seq,name,standard_time_min,department_id}] } -> 201
POST /api/v1/work-orders   body { customer_id?, finished_item_id, qty, due_date, routing_template_id, machine?, mockup? } -> 201 (wo_no auto, steps materialized)
GET  /api/v1/work-orders/{id}                          -> { wo, steps[], defects[] }
GET  /api/v1/work-orders/timeline?from=&to=&status=    -> [ { wo_no, customer, due_date, steps:[{name,status,started_at,finished_at,is_delayed}] } ]  # Gantt feed

POST /api/v1/wo-steps/{id}/scan   body { action:'START'|'FINISH' }  -> 200 { step } | 409
POST /api/v1/wo-steps/{id}/hold   body { reason }       -> 200
POST /api/v1/wo-steps/{id}/defects body { type, qty, note } -> 201
POST /api/v1/wo-steps/{id}/subcontract body { vendor, sla_due } -> 201 (OUTSOURCED)
POST /api/v1/subcontracts/{id}/receive                 -> 200 (RECEIVED)

GET  /api/v1/reports/wip            -> [ { department, in_progress_count, delayed_count } ]  # bottleneck view
```
Realtime: `StepStarted/StepFinished/StepDelayed` pushed over Socket.IO room `wo:{id}` and `timeline` for live Gantt updates.

### 4.7 Acceptance criteria
- Scan START on "Sew" ⇒ step IN_PROGRESS, timer running; exceeding `standard_time_min` ⇒ `StepDelayed` emitted, supervisor notified, step flagged delayed in the timeline feed.
- Subcontract a step ⇒ OUTSOURCED + SLA countdown; receive ⇒ timeline continues automatically.
- Completing the final step ⇒ WO COMPLETED and exactly one backflush in M3 (idempotent: a duplicate `WorkOrderCompleted` does not double-post).
- Editing a routing template after a WO exists does not change that WO's materialized steps.

---

## M5 — Sales Documents

### 5.1 Responsibilities
Customers, Quotation → Invoice → Receipt/Tax-Invoice lifecycle, VAT (inclusive/exclusive) & WHT computation, partial billing, PromptPay QR, credit terms/aging, template customization & PDF/Excel/JPG export, optional inventory deduction, optional e-Tax XML, and void with audit.

### 5.2 Data model
```sql
CREATE TABLE customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, tax_id text, branch_code text DEFAULT '00000',
  addresses jsonb NOT NULL DEFAULT '[]',
  credit_terms_days int NOT NULL DEFAULT 0,
  -- + common columns
  version int NOT NULL DEFAULT 0
);

CREATE TABLE quotation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text NOT NULL UNIQUE,             -- QV{yyyy}{seq} or QNV...
  customer_id uuid NOT NULL REFERENCES customer(id),
  vat_mode text NOT NULL,                  -- VAT | NON_VAT
  vat_calc text NOT NULL,                  -- INCLUDE (Vat Nai) | EXCLUDE (Vat Nok)
  valid_until date,
  status text NOT NULL DEFAULT 'DRAFT',
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  vat_amount numeric(18,4) NOT NULL DEFAULT 0,
  grand_total numeric(18,4) NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 0
);

CREATE TABLE invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text NOT NULL UNIQUE,
  quotation_id uuid NULL REFERENCES quotation(id),
  customer_id uuid NOT NULL REFERENCES customer(id),
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  wht_rate numeric(9,6) NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  subtotal numeric(18,4), vat_amount numeric(18,4),
  wht_amount numeric(18,4) DEFAULT 0,
  grand_total numeric(18,4), amount_paid numeric(18,4) NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 0
);

CREATE TABLE doc_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL,               -- QUOTATION | INVOICE
  parent_id uuid NOT NULL,
  item_id uuid NULL REFERENCES item(id),
  description text NOT NULL,
  qty numeric(18,6) NOT NULL, unit_price numeric(18,4) NOT NULL,
  discount numeric(18,4) NOT NULL DEFAULT 0,
  line_total numeric(18,4) NOT NULL
);
CREATE INDEX ON doc_line (parent_type, parent_id);

CREATE TABLE payment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  amount numeric(18,4) NOT NULL, method text NOT NULL,   -- TRANSFER | PROMPTPAY | CASH | ...
  paid_at timestamptz NOT NULL DEFAULT now(),
  promptpay_ref text NULL
);

CREATE TABLE receipt_tax_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  type text NOT NULL,                      -- RECEIPT | TAX_INVOICE | RECEIPT_TAX_INVOICE
  paid_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wht_certificate (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoice(id),
  rate numeric(9,6) NOT NULL, amount numeric(18,4) NOT NULL
);

CREATE TABLE document_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL, layout jsonb NOT NULL,
  logo_key text, signature_key text, stamp_key text,
  excel_named_ranges jsonb NULL
);
```

### 5.3 Enums & state machines
```
quotation.status = DRAFT | SENT | APPROVED | EXPIRED | REJECTED | CONVERTED | VOID
invoice.status   = DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | VOID

Quotation: DRAFT -> SENT -> APPROVED -> CONVERTED   (| EXPIRED once past valid_until | REJECTED | VOID)
Invoice:   DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID   (| OVERDUE past due_date & not PAID | VOID)
Receipt/Tax-Invoice issued on (first) payment.
```

### 5.4 Tax & money rules (implementable)
- **VAT EXCLUDE (Vat Nok):** `vat = subtotal × rate`; `grand_total = subtotal + vat`.
- **VAT INCLUDE (Vat Nai):** prices already include VAT; `subtotal = grand_total / (1+rate)`; `vat = grand_total − subtotal`. Round each at 4 dp, half-up.
- **Non-VAT:** `vat_amount = 0`; only a RECEIPT may be issued (never `type=TAX_INVOICE`).
- **WHT:** `wht_amount = subtotal × wht_rate` (on the pre-VAT base unless config says otherwise); **net transfer expected** = `grand_total − wht_amount`; issue a `wht_certificate`.
- **Partial billing:** one quotation → many invoices; sum of invoice subtotals ≤ quotation subtotal (enforced, 422 on exceed).
- **PromptPay QR:** generate EMVCo payload embedding the PromptPay ID (Q7) + amount; rendered onto the invoice PDF.
- **Numbering:** `QV`=VAT quotation, `QNV`=non-VAT; invoice/receipt sequences separate; yearly reset configurable (§0.6).

### 5.5 Invariants
- All totals are **server-computed** from `doc_line`; client-sent totals are ignored.
- `1-click convert`: APPROVED quotation → new invoice copying lines/prices; quotation→CONVERTED atomically; re-convert ⇒ 409.
- **Void** requires `sales.document.void` + reason; sets VOID, never deletes; if the invoice triggered a stock OUT, voiding posts a compensating IN (via M3) — voiding is blocked (409) if a receipt/tax-invoice already exists.
- Recording a payment updates `amount_paid`; `= grand_total−wht` ⇒ PAID, `0<paid<...` ⇒ PARTIALLY_PAID, and issues the receipt/tax-invoice.

### 5.6 Domain events
Emitted: `QuotationApproved`, `InvoiceIssued`, `DeliveryNoteIssued` (optional stock OUT), `PaymentReceived`, `InvoiceOverdue`, `DocumentVoided`.
Consumed: `WorkOrderCompleted` (optional: auto-draft invoice), item/price reads from M3.

### 5.7 API endpoints
```
POST /api/v1/customers  body { name, tax_id?, branch_code?, addresses[], credit_terms_days } -> 201
GET  /api/v1/customers?search=  -> autocomplete (name/tax_id -> fills address+branch)

POST /api/v1/quotations  body { customer_id, vat_mode, vat_calc, valid_until, lines[] } -> 201 (doc_no auto by mode)
POST /api/v1/quotations/{id}/send | /approve | /reject     -> 200
POST /api/v1/quotations/{id}/convert  (sales.invoice.create) -> 201 { invoice }  | 409

POST /api/v1/invoices    body { customer_id, lines[], due_date|credit_terms, wht_rate?, from_quotation_id? } -> 201
POST /api/v1/invoices/{id}/issue                          -> 200 (ISSUED; optional stock OUT if inventory-linked)
POST /api/v1/invoices/{id}/payments  body { amount, method, promptpay_ref? } -> 201 (issues receipt; sets PAID/PARTIALLY_PAID)
POST /api/v1/invoices/{id}/void      body { reason } (sales.document.void)    -> 200 | 409
GET  /api/v1/invoices/{id}/promptpay-qr                   -> { payload, png_base64 }
GET  /api/v1/invoices/{id}/export?format=pdf|excel|jpg    -> 202 { job_id }
GET  /api/v1/invoices/{id}/wht-certificate               -> 202 { job_id }

GET  /api/v1/reports/aging?as_of=    -> [ { customer, current, d1_30, d31_60, d61_90, over_90 } ]
POST /api/v1/etax/{invoice_id}/submit (optional, perm sales.etax.submit) -> 202 { job_id }   # XML to RD
```

### 5.8 Acceptance criteria
- Vat Nok line ฿100 ⇒ invoice subtotal 100, VAT 7, grand 107. Vat Nai ฿107 ⇒ subtotal 100, VAT 7 (correct back-out).
- Services invoice ฿100,000 + WHT 3% ⇒ certificate 3,000, expected net transfer 97,000 (+VAT per mode).
- Convert from APPROVED quotation ⇒ invoice with identical lines/prices; quotation status CONVERTED; second convert ⇒ 409.
- Two invoices off one quotation whose subtotals exceed the quotation ⇒ 422 on the second.
- Void after a receipt exists ⇒ 409; valid void writes `audit_log` (action=VOID, reason).
- Concurrent document numbering under load yields zero duplicate `doc_no` (sequence/row-lock).

---

## M6 — Reporting & Analytics

### 6.1 Responsibilities
Read-only analytical layer over M2–M5: inventory/sales/cost/profit dashboards with cross-filtering, exports (Excel/CSV/PDF), and scheduled email digests. Reads exclusively from the **read-replica / materialized views** to avoid impacting OLTP.

### 6.2 Data model (read models)
No write tables. Materialized views refreshed on a schedule or on relevant domain events:
```sql
CREATE MATERIALIZED VIEW mv_stock_valuation AS
  SELECT item_id, warehouse_id, qty_on_hand, avg_cost, qty_on_hand*avg_cost AS value
  FROM stock_balance;                                  -- refresh on GoodsReceiptPosted/GoodsIssued/StockAdjusted

CREATE MATERIALIZED VIEW mv_sales_daily AS
  SELECT issue_date::date AS d, customer_id,
         sum(subtotal) AS sales, sum(vat_amount) AS vat
  FROM invoice WHERE status <> 'VOID' GROUP BY 1,2;    -- refresh on InvoiceIssued/PaymentReceived

CREATE MATERIALIZED VIEW mv_cogs_monthly AS
  SELECT date_trunc('month', at) AS m, sum(qty*unit_cost) AS cogs
  FROM stock_movement WHERE direction='OUT' AND ref_type IN ('GOODS_ISSUE','BACKFLUSH')
  GROUP BY 1;

-- report_schedule drives the email digest job
CREATE TABLE report_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, report_key text NOT NULL,
  cron text NOT NULL,                      -- e.g. '0 8 * * 1' (Mon 08:00)
  recipients text[] NOT NULL, format text NOT NULL DEFAULT 'PDF',
  params jsonb DEFAULT '{}', is_active boolean DEFAULT true
);
```

### 6.3 Report catalog
| Group | Report key | Output |
|---|---|---|
| Inventory | `stock.balance`, `stock.movement`, `stock.low`, `stock.dead?months=` | balances, card, reorder list |
| Sales | `sales.overview` (day/month/year vs target), `sales.top_products`, `sales.by_customer`, `sales.doc_status` | series + breakdowns |
| Cost | `cost.cogs_monthly`, `cost.variance` (BOM vs actual), `cost.valuation` (RM/WIP/FG) | tables/charts |
| Profit | `profit.margin_by_item`, `profit.by_order`, `profit.net_estimate` | margin analysis |
| Tax | `tax.pp30` (sales/purchase VAT), `tax.aging` (AR) | export-ready |

### 6.4 Business rules & invariants
- All endpoints are **GET, read-replica only**, RBAC-gated by `report.<group>.view`; cost/profit reports additionally require `inventory.cost.view`.
- **Cross-filtering:** a query param set (`?dimension=month&value=2026-03`) is applied consistently across every panel of a dashboard request so panels stay in sync.
- Valuation equals the sum of current ledger value (`mv_stock_valuation`), reconciling to each item's stock card (M3 invariant).
- Exports run as **async jobs** (202 + `job_id`); large result sets stream to Excel/CSV; PDF via the shared HTML→PDF renderer (ADR-005).
- **Scheduled digests:** a BullMQ repeatable job per active `report_schedule` renders the report and emails it; failures retry with backoff and alert in-app.

### 6.5 Domain events
Emitted: `ReportGenerated`, `ScheduledReportSent`.
Consumed: `GoodsReceiptPosted`, `GoodsIssued`, `StockAdjusted`, `InvoiceIssued`, `PaymentReceived`, `BackflushPosted` → trigger targeted `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

### 6.6 API endpoints
```
GET  /api/v1/reports/{report_key}?from=&to=&dimension=&value=&filters... -> { columns[], rows[], totals }   (read-replica)
GET  /api/v1/dashboards/{key}?filter[...]=   -> { panels:[ { key, data } ] }   (cross-filtered)
POST /api/v1/reports/{report_key}/export  body { format, params } -> 202 { job_id }
GET  /api/v1/exports/{job_id}             -> { status, file_url? }
GET/POST/PUT/DELETE /api/v1/report-schedules   (perm report.schedule.manage)
POST /api/v1/report-schedules/{id}/run-now -> 202 { job_id }
```

### 6.7 Acceptance criteria
- Clicking "this month" on the sales panel re-filters Top-Products and Sales-by-Customer to the same window (single dimension applied across panels).
- `cost.valuation` total equals the sum over `mv_stock_valuation`, matching M3 stock cards item-by-item.
- A `0 8 * * 1` schedule emails the configured recipients a summary with attachment every Monday 08:00; a send failure retries and surfaces an in-app alert.
- A user with `report.sales.view` but not `inventory.cost.view` can open sales reports but receives 403 on cost/profit reports.

---

## 7. Cross-Module Domain Event Catalog

| Event | Emitter | Consumers | Sync/Async |
|---|---|---|---|
| `PermissionsChanged` | M1 | session guard, audit | sync |
| `EmployeeCreated` | M2 | M1 (user link), numbering | sync |
| `PayrollApproved` | M2 | M6, notification | async |
| `GoodsReceiptPosted` | M3 | M6 (MV refresh), audit | async |
| `GoodsIssued` | M3 | M6, costing | async |
| `LowStockReached` | M3 | notification (LINE/email/in-app) | async |
| `BackflushPosted` | M3 | M6, audit | async |
| `WorkOrderCompleted` | M4 | M3 (backflush), M5 (optional invoice) | sync→M3 |
| `StepDelayed` | M4 | notification, realtime | async |
| `SubcontractOverdue` | M4 | notification | async |
| `QuotationApproved` | M5 | (UI), audit | async |
| `InvoiceIssued` | M5 | M3 (optional OUT), M6 | sync→M3 |
| `PaymentReceived` | M5 | M6, receipt issuance | sync |
| `InvoiceOverdue` | M5 | notification | async |
| `DocumentVoided` | M5 | M3 (compensating), audit | sync |

All side-effecting consumers are **idempotent** keyed on `(event, correlation_id)`; async handlers run on BullMQ with retry + dead-letter.

## 8. Shared Error Codes
| `code` | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Field validation failed (`details[]`) |
| `UNAUTHENTICATED` | 401 | Missing/expired token or stale `permissions_version` |
| `FORBIDDEN` | 403 | Lacks required permission |
| `NOT_FOUND` | 404 | Entity missing |
| `STATE_CONFLICT` | 409 | Illegal state transition / uniqueness / optimistic-lock |
| `BUSINESS_RULE` | 422 | Rule violation (insufficient stock, over-ceiling, total exceeded) |
| `REAUTH_REQUIRED` | 403 | Super-Admin re-authentication needed |
| `IDEMPOTENT_REPLAY` | 200 | Returned cached response for a repeated `Idempotency-Key` |

---

*End of Backend Implementation Specification (M1–M6) · v1.0. Pair with the per-module ERD and the full permission catalog before sprint 1.*
