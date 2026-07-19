import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  department,
  employee,
  employeeDocument,
  notDeleted,
  position,
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
  EmployeesQuery,
  Position,
  UpdateEmployeeRequest,
} from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { assertVersion } from "../common/concurrency/if-match.js";
import { CryptoService } from "../common/crypto/crypto.service.js";
import { NotFoundError, StateConflictError } from "../common/errors/app-exception.js";
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

  // ── Internal ─────────────────────────────────────────────────────────────────

  private async assertExists(id: string): Promise<void> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, id), notDeleted(employee.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError("Employee not found");
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
