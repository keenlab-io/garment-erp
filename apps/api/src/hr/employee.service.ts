import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  department,
  employee,
  employeeDocument,
  notDeleted,
  position,
  reportingLine,
  type Db,
} from "@erp/db";
import type {
  CreateDepartmentRequest,
  CreateEmployeeRequest,
  CreatePositionRequest,
  Department,
  Employee,
  EmployeeDocument,
  EmployeeDocumentType,
  EmployeeRef,
  EmployeesQuery,
  Position,
  ReportingLine,
  SetReportingLineRequest,
  UpdateDepartmentRequest,
  UpdateEmployeeRequest,
  UpdatePositionRequest,
} from "@erp/contracts";
import { AuditService } from "../audit/audit.service.js";
import type { AuthUser } from "../auth/auth-user.js";
import { assertVersion } from "../common/concurrency/if-match.js";
import { CryptoService } from "../common/crypto/crypto.service.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { SequenceService } from "../sequence/sequence.service.js";
import { StorageService } from "../storage/storage.service.js";
import { CompensationService } from "./compensation.service.js";
import { HR_EVENTS, type EmployeeCreatedPayload } from "./hr.events.js";
import { decodeEmployeeCursor, mN } from "./hr.util.js";

/**
 * Defensive bound on the upward walks in `assertNoDepartmentCycle` /
 * `assertNoManagerCycle` (design D3). A real org chart is nowhere near this deep, so
 * exceeding it means the stored data already contains a cycle — error rather than loop.
 */
const CYCLE_HOP_LIMIT = 256;

/** The `EmployeeRef` projection — deliberately no salary/PII columns (design D5). */
const EMPLOYEE_REF_COLUMNS = {
  id: employee.id,
  emp_code: employee.empCode,
  first_name: employee.firstName,
  last_name: employee.lastName,
} satisfies Record<keyof EmployeeRef, unknown>;

/**
 * Employee master, documents & org structure (task 4.1). Create issues an `emp_code`
 * (`EXT0001`) via SequenceService and PII-encrypts the national ID (design D1); reads
 * decrypt it and attach the current base salary — both are salary/PII fields the controller
 * gates. Updates are `If-Match` guarded (optimistic `version`). Documents land in object
 * storage; org departments/positions are CRUD'd here.
 */
@Injectable()
export class EmployeeService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly comp: CompensationService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateEmployeeRequest, actor: AuthUser): Promise<Employee> {
    const ex = currentExecutor(this.db);
    const empCode = await this.sequences.next("EMPLOYEE");
    const [row] = await ex
      .insert(employee)
      .values({
        empCode,
        firstName: input.first_name,
        lastName: input.last_name,
        nationalIdEnc: input.national_id
          ? this.crypto.encrypt(input.national_id)
          : null,
        profile: input.profile,
        positionId: input.position_id ?? null,
        employmentType: input.employment_type,
        hireDate: input.hire_date,
        probationEndDate: input.probation_end_date ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning({ id: employee.id });
    if (!row) throw new StateConflictError("Employee could not be created");

    this.events.publishAfterCommit(
      makeEvent<EmployeeCreatedPayload>({
        event: HR_EVENTS.employeeCreated,
        actorUserId: actor.id,
        payload: { employee_id: row.id, emp_code: empCode },
      }),
    );

    return this.load(row.id);
  }

  async update(
    id: string,
    expectedVersion: number | null,
    input: UpdateEmployeeRequest,
    actor: AuthUser,
  ): Promise<Employee> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ version: employee.version })
      .from(employee)
      .where(and(eq(employee.id, id), notDeleted(employee.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError("Employee not found");
    if (expectedVersion !== null) assertVersion(row.version, expectedVersion);

    const patch: Record<string, unknown> = {
      updatedBy: actor.id,
      updatedAt: new Date(),
      version: sql`${employee.version} + 1`,
    };
    if (input.first_name !== undefined) patch.firstName = input.first_name;
    if (input.last_name !== undefined) patch.lastName = input.last_name;
    if (input.national_id !== undefined) {
      patch.nationalIdEnc = input.national_id
        ? this.crypto.encrypt(input.national_id)
        : null;
    }
    if (input.employment_type !== undefined) patch.employmentType = input.employment_type;
    if (input.position_id !== undefined) patch.positionId = input.position_id;
    if (input.status !== undefined) patch.status = input.status;
    if (input.probation_end_date !== undefined) {
      patch.probationEndDate = input.probation_end_date;
    }
    if (input.profile !== undefined) patch.profile = input.profile;

    await ex.update(employee).set(patch).where(eq(employee.id, id));
    return this.load(id);
  }

  async get(id: string): Promise<Employee> {
    return this.load(id);
  }

  async list(
    query: EmployeesQuery,
  ): Promise<{ data: Employee[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const decoded = query.cursor ? decodeEmployeeCursor(query.cursor) : null;
    const filters = [
      notDeleted(employee.deletedAt),
      query["filter[status]"] ? eq(employee.status, query["filter[status]"]) : undefined,
      decoded
        ? sql`(${employee.createdAt}, ${employee.id}) < (${new Date(decoded.createdAt)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select({ id: employee.id, createdAt: employee.createdAt })
      .from(employee)
      .where(and(...filters))
      .orderBy(desc(employee.createdAt), desc(employee.id))
      .limit(query.limit + 1);

    const page = buildPage(rows, query.limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));
    const data = await Promise.all(page.data.map((r) => this.load(r.id)));
    return { data, next_cursor: page.next_cursor };
  }

  /** Store an uploaded document in object storage and record it. */
  async addDocument(
    employeeId: string,
    type: EmployeeDocumentType,
    file: Buffer,
    contentType?: string,
  ): Promise<EmployeeDocument> {
    const ex = currentExecutor(this.db);
    await this.assertExists(employeeId);
    const fileKey = `employee-docs/${employeeId}/${randomUUID()}`;
    await this.storage.put(fileKey, file, contentType);
    const [row] = await ex
      .insert(employeeDocument)
      .values({ employeeId, type, fileKey })
      .returning();
    if (!row) throw new StateConflictError("Document could not be stored");
    return {
      id: row.id,
      employee_id: row.employeeId,
      type: row.type,
      file_key: row.fileKey,
      uploaded_at: row.uploadedAt.toISOString(),
    };
  }

  /** List an employee's documents (Documents tab — MD4). */
  async listDocuments(employeeId: string): Promise<EmployeeDocument[]> {
    const ex = currentExecutor(this.db);
    await this.assertExists(employeeId);
    const rows = await ex
      .select()
      .from(employeeDocument)
      .where(eq(employeeDocument.employeeId, employeeId))
      .orderBy(desc(employeeDocument.uploadedAt));
    return rows.map((row) => ({
      id: row.id,
      employee_id: row.employeeId,
      type: row.type,
      file_key: row.fileKey,
      uploaded_at: row.uploadedAt.toISOString(),
    }));
  }

  /** A fresh signed, expiring URL for one document — never rendered inline (MD4). */
  async getDocumentUrl(employeeId: string, documentId: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ fileKey: employeeDocument.fileKey })
      .from(employeeDocument)
      .where(
        and(eq(employeeDocument.id, documentId), eq(employeeDocument.employeeId, employeeId)),
      )
      .limit(1);
    if (!row) throw new NotFoundError("Document not found");
    return this.storage.getSignedUrl(row.fileKey);
  }

  // ── Org structure ──────────────────────────────────────────────────────────

  async createDepartment(
    input: CreateDepartmentRequest,
    actor: AuthUser,
  ): Promise<Department> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(department)
      .values({
        name: input.name,
        parentId: input.parent_id ?? null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (!row) throw new StateConflictError("Department could not be created");
    return { id: row.id, name: row.name, parent_id: row.parentId };
  }

  async listDepartments(): Promise<Department[]> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select()
      .from(department)
      .where(notDeleted(department.deletedAt))
      .orderBy(department.name);
    return rows.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId }));
  }

  /**
   * Rename and/or re-parent a department. Re-parenting is cycle-guarded inside the caller's
   * transaction so concurrent edits cannot commit a loop (design D1/D3). Last-write-wins —
   * org rows carry no `version` — but the audit row makes an overwrite reconstructable.
   */
  async updateDepartment(
    id: string,
    input: UpdateDepartmentRequest,
    actor: AuthUser,
  ): Promise<Department> {
    const ex = currentExecutor(this.db);
    const before = await this.loadDepartment(id);

    const patch: Record<string, unknown> = { updatedBy: actor.id, updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.parent_id !== undefined && input.parent_id !== before.parent_id) {
      if (input.parent_id !== null) {
        await this.loadDepartment(input.parent_id, "Parent department not found");
        await this.assertNoDepartmentCycle(id, input.parent_id);
      }
      patch.parentId = input.parent_id;
    }

    await ex.update(department).set(patch).where(eq(department.id, id));
    const after = await this.loadDepartment(id);
    await this.audit.record({
      action: "UPDATE",
      entityType: "department",
      entityId: id,
      actorUserId: actor.id,
      before,
      after,
    });
    return after;
  }

  /**
   * Soft-delete a department. Refused with 409 while it still has live children or live
   * positions — the operator moves them first rather than the delete cascading (design D2).
   */
  async deleteDepartment(id: string, actor: AuthUser): Promise<void> {
    const ex = currentExecutor(this.db);
    const before = await this.loadDepartment(id);

    const children = await this.countLive(
      department,
      and(eq(department.parentId, id), notDeleted(department.deletedAt)),
    );
    if (children > 0) {
      throw new StateConflictError(
        `Department still has ${children} live child department(s)`,
      );
    }
    const positions = await this.countLive(
      position,
      and(eq(position.departmentId, id), notDeleted(position.deletedAt)),
    );
    if (positions > 0) {
      throw new StateConflictError(`Department still has ${positions} live position(s)`);
    }

    await ex
      .update(department)
      .set({ deletedAt: new Date(), updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(department.id, id));
    await this.audit.record({
      action: "DELETE",
      entityType: "department",
      entityId: id,
      actorUserId: actor.id,
      before,
      after: null,
    });
  }

  async createPosition(
    input: CreatePositionRequest,
    actor: AuthUser,
  ): Promise<Position> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(position)
      .values({
        title: input.title,
        jobDescription: input.job_description ?? null,
        departmentId: input.department_id,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (!row) throw new StateConflictError("Position could not be created");
    return {
      id: row.id,
      title: row.title,
      job_description: row.jobDescription,
      department_id: row.departmentId,
    };
  }

  async listPositions(): Promise<Position[]> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select()
      .from(position)
      .where(notDeleted(position.deletedAt))
      .orderBy(position.title);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      job_description: r.jobDescription,
      department_id: r.departmentId,
    }));
  }

  /**
   * Retitle a position, edit its job description, or move it to another department. Moving
   * takes its employees with it — they keep the same `position_id` (design D4).
   */
  async updatePosition(
    id: string,
    input: UpdatePositionRequest,
    actor: AuthUser,
  ): Promise<Position> {
    const ex = currentExecutor(this.db);
    const before = await this.loadPosition(id);

    const patch: Record<string, unknown> = { updatedBy: actor.id, updatedAt: new Date() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.job_description !== undefined) patch.jobDescription = input.job_description;
    if (input.department_id !== undefined && input.department_id !== before.department_id) {
      await this.loadDepartment(input.department_id, "Target department not found");
      patch.departmentId = input.department_id;
    }

    await ex.update(position).set(patch).where(eq(position.id, id));
    const after = await this.loadPosition(id);
    await this.audit.record({
      action: "UPDATE",
      entityType: "position",
      entityId: id,
      actorUserId: actor.id,
      before,
      after,
    });
    return after;
  }

  /**
   * Soft-delete a position. Refused with 409 while any live employee still holds it — a
   * resigned employee counts, because the assignment is history worth keeping readable
   * (design D2). Either way no employee's `position_id` is ever silently nulled.
   */
  async deletePosition(id: string, actor: AuthUser): Promise<void> {
    const ex = currentExecutor(this.db);
    const before = await this.loadPosition(id);

    const holders = await this.countLive(
      employee,
      and(eq(employee.positionId, id), notDeleted(employee.deletedAt)),
    );
    if (holders > 0) {
      throw new StateConflictError(`Position is still held by ${holders} employee(s)`);
    }

    await ex
      .update(position)
      .set({ deletedAt: new Date(), updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(position.id, id));
    await this.audit.record({
      action: "DELETE",
      entityType: "position",
      entityId: id,
      actorUserId: actor.id,
      before,
      after: null,
    });
  }

  // ── Reporting line ─────────────────────────────────────────────────────────

  /**
   * An employee's manager plus their direct reports — the same table read in both
   * directions. Projects `EmployeeRef` only: no salary or national ID crosses this
   * endpoint, so it needs no salary gating (design D5).
   */
  async getReportingLine(id: string): Promise<ReportingLine> {
    const ex = currentExecutor(this.db);
    await this.assertExists(id);

    const [managerRow] = await ex
      .select(EMPLOYEE_REF_COLUMNS)
      .from(reportingLine)
      .innerJoin(employee, eq(employee.id, reportingLine.managerEmployeeId))
      .where(and(eq(reportingLine.employeeId, id), notDeleted(employee.deletedAt)))
      .limit(1);

    const reports = await ex
      .select(EMPLOYEE_REF_COLUMNS)
      .from(reportingLine)
      .innerJoin(employee, eq(employee.id, reportingLine.employeeId))
      .where(and(eq(reportingLine.managerEmployeeId, id), notDeleted(employee.deletedAt)))
      .orderBy(employee.empCode);

    return { manager: managerRow ?? null, direct_reports: reports };
  }

  /**
   * Set or clear (`manager_employee_id: null`) an employee's manager. One upsert on the
   * `employee_id` primary key, cycle-guarded in the caller's transaction (design D3/D5).
   */
  async setReportingLine(
    id: string,
    input: SetReportingLineRequest,
    actor: AuthUser,
  ): Promise<ReportingLine> {
    const ex = currentExecutor(this.db);
    await this.assertExists(id);
    const managerId = input.manager_employee_id;
    if (managerId !== null) {
      await this.assertExists(managerId, "Manager not found");
      await this.assertNoManagerCycle(id, managerId);
    }

    const [before] = await ex
      .select({ managerEmployeeId: reportingLine.managerEmployeeId })
      .from(reportingLine)
      .where(eq(reportingLine.employeeId, id))
      .limit(1);

    await ex
      .insert(reportingLine)
      .values({ employeeId: id, managerEmployeeId: managerId })
      .onConflictDoUpdate({
        target: reportingLine.employeeId,
        set: { managerEmployeeId: managerId },
      });

    await this.audit.record({
      action: "UPDATE",
      entityType: "reporting_line",
      entityId: id,
      actorUserId: actor.id,
      before: { manager_employee_id: before?.managerEmployeeId ?? null },
      after: { manager_employee_id: managerId },
    });
    return this.getReportingLine(id);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private async assertExists(id: string, message = "Employee not found"): Promise<void> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, id), notDeleted(employee.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError(message);
  }

  /** Load a live department as the wire DTO; 404 if missing or soft-deleted. */
  private async loadDepartment(
    id: string,
    message = "Department not found",
  ): Promise<Department> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(department)
      .where(and(eq(department.id, id), notDeleted(department.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError(message);
    return { id: row.id, name: row.name, parent_id: row.parentId };
  }

  /** Load a live position as the wire DTO; 404 if missing or soft-deleted. */
  private async loadPosition(id: string): Promise<Position> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(position)
      .where(and(eq(position.id, id), notDeleted(position.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError("Position not found");
    return {
      id: row.id,
      title: row.title,
      job_description: row.jobDescription,
      department_id: row.departmentId,
    };
  }

  /** Count rows matching `where` on the caller's executor (in-transaction referent checks). */
  private async countLive(table: PgTable, where: SQL | undefined): Promise<number> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(table)
      .where(where);
    return row?.n ?? 0;
  }

  /**
   * Refuse a re-parent that would make `id` its own ancestor. Walks *upward* from the
   * proposed parent following `parent_id` — self-reference is the depth-0 case — and bails
   * out at `CYCLE_HOP_LIMIT` so pre-existing bad data errors instead of looping (design D3).
   */
  private async assertNoDepartmentCycle(id: string, newParentId: string): Promise<void> {
    const ex = currentExecutor(this.db);
    let cursor: string | null = newParentId;
    for (let hop = 0; cursor !== null; hop += 1) {
      if (cursor === id) {
        throw new BusinessRuleError("A department cannot become its own ancestor");
      }
      if (hop >= CYCLE_HOP_LIMIT) {
        throw new BusinessRuleError("Department hierarchy is too deep to re-parent safely");
      }
      const [row]: { parentId: string | null }[] = await ex
        .select({ parentId: department.parentId })
        .from(department)
        .where(eq(department.id, cursor))
        .limit(1);
      cursor = row?.parentId ?? null;
    }
  }

  /** The same upward walk over `manager_employee_id` — an employee may not manage themselves. */
  private async assertNoManagerCycle(id: string, newManagerId: string): Promise<void> {
    const ex = currentExecutor(this.db);
    let cursor: string | null = newManagerId;
    for (let hop = 0; cursor !== null; hop += 1) {
      if (cursor === id) {
        throw new BusinessRuleError(
          "An employee cannot report to themselves, directly or indirectly",
        );
      }
      if (hop >= CYCLE_HOP_LIMIT) {
        throw new BusinessRuleError("Reporting chain is too deep to reassign safely");
      }
      const [row]: { managerEmployeeId: string | null }[] = await ex
        .select({ managerEmployeeId: reportingLine.managerEmployeeId })
        .from(reportingLine)
        .where(eq(reportingLine.employeeId, cursor))
        .limit(1);
      cursor = row?.managerEmployeeId ?? null;
    }
  }

  /**
   * Load an employee as the wire DTO — national ID decrypted and current base salary
   * attached. Both `national_id` and `base_salary` are salary/PII fields the caller must
   * gate via `gateSalaryFields` before returning.
   */
  private async load(id: string): Promise<Employee> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(employee)
      .where(and(eq(employee.id, id), notDeleted(employee.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError("Employee not found");

    const base = await this.comp.currentBaseSalary(id);
    const dto: Employee = {
      id: row.id,
      emp_code: row.empCode,
      first_name: row.firstName,
      last_name: row.lastName,
      employment_type: row.employmentType,
      status: row.status,
      position_id: row.positionId,
      hire_date: row.hireDate,
      probation_end_date: row.probationEndDate,
      profile: (row.profile ?? {}) as Record<string, unknown>,
      version: row.version,
    };
    if (row.nationalIdEnc) {
      dto.national_id = this.crypto.decrypt(Buffer.from(row.nationalIdEnc));
    }
    const gatedBase = mN(base);
    if (gatedBase !== null) dto.base_salary = gatedBase;
    return dto;
  }
}
