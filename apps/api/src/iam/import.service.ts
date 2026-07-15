import { Inject, Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import { eq, inArray, sql } from "drizzle-orm";
import {
  permission,
  role,
  rolePermission,
  user,
  userRole,
  type Db,
} from "@erp/db";
import type { ImportResult, ImportSkip } from "@erp/contracts";
import type { AuthUser } from "../auth/auth-user.js";
import { ValidationError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";

/** One raw worksheet row: role name in column A, permission codes in column B. */
export interface RawImportRow {
  rowNumber: number;
  roleName: string;
  codesRaw: string;
}

/** A parsed, applicable import row. */
export interface ParsedImportRow {
  rowNumber: number;
  roleName: string;
  codes: string[];
}

export interface ParsedImport {
  rows: ParsedImportRow[];
  skipped: ImportSkip[];
}

const HEADER_TOKENS = new Set(["role", "role name", "role_name", "name"]);

/** Split a permission-codes cell on whitespace/comma/semicolon into trimmed codes. */
export function parseCodesCell(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Turn raw worksheet rows into applicable rows plus a `skipped` list. A leading
 * header row is dropped; fully-empty rows are ignored; a row with codes but no role
 * name is skipped with a reason (all-or-nothing still holds — skips are intentional,
 * not errors).
 */
export function collectRows(raws: RawImportRow[]): ParsedImport {
  const rows: ParsedImportRow[] = [];
  const skipped: ImportSkip[] = [];

  raws.forEach((raw, index) => {
    const roleName = raw.roleName.trim();
    const codesRaw = raw.codesRaw.trim();

    // Drop a leading header row (`role_name | permission_codes`).
    if (index === 0 && HEADER_TOKENS.has(roleName.toLowerCase())) return;

    if (!roleName && !codesRaw) return; // fully empty → ignore
    if (!roleName) {
      skipped.push({ row: raw.rowNumber, reason: "Missing role name" });
      return;
    }
    rows.push({ rowNumber: raw.rowNumber, roleName, codes: parseCodesCell(codesRaw) });
  });

  return { rows, skipped };
}

/**
 * All-or-nothing Excel import of a role→permission matrix (spec §1.5, design D7).
 * Every referenced code is validated against the `permission` catalog; any unknown
 * code fails the whole import with a 400 naming the offending rows and persists
 * nothing. On success, roles are upserted by name, their grants replaced, and every
 * affected bound user's `permissions_version` bumped — all in one transaction.
 */
@Injectable()
export class ImportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly events: EventBusService,
  ) {}

  async import(buffer: Buffer, actor: AuthUser): Promise<ImportResult> {
    const raws = await readWorkbook(buffer);
    const parsed = collectRows(raws);

    return this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);

      // Validate every referenced code against the catalog before writing anything.
      const referenced = [...new Set(parsed.rows.flatMap((r) => r.codes))];
      const known = referenced.length
        ? await ex
            .select({ id: permission.id, code: permission.code })
            .from(permission)
            .where(inArray(permission.code, referenced))
        : [];
      const idByCode = new Map(known.map((k) => [k.code, k.id]));

      const offending = parsed.rows
        .filter((r) => r.codes.some((c) => !idByCode.has(c)))
        .map((r) => ({
          field: `row ${r.rowNumber}`,
          issue: `unknown permission code(s): ${r.codes
            .filter((c) => !idByCode.has(c))
            .join(", ")}`,
        }));
      if (offending.length > 0) {
        throw new ValidationError(
          "Import contains unknown permission codes",
          offending,
        );
      }

      let imported = 0;
      for (const row of parsed.rows) {
        const roleId = await this.upsertRole(row.roleName, actor);
        await ex
          .delete(rolePermission)
          .where(eq(rolePermission.roleId, roleId));
        if (row.codes.length > 0) {
          await ex.insert(rolePermission).values(
            row.codes.map((c) => ({
              roleId,
              permissionId: idByCode.get(c) as string,
            })),
          );
        }
        await this.bumpBoundUsers(roleId);
        imported += 1;
      }

      await this.events.publishInTransaction(
        makeEvent({
          event: "iam.import.applied",
          actorUserId: actor.id,
          payload: {
            audit: {
              action: "PERMISSION_CHANGE" as const,
              entityType: "role",
              actorUserId: actor.id,
              after: { imported, roles: parsed.rows.map((r) => r.roleName) },
            },
          },
        }),
      );

      return { imported, skipped: parsed.skipped };
    });
  }

  /** Find a role by name or create it; returns its id. */
  private async upsertRole(name: string, actor: AuthUser): Promise<string> {
    const ex = currentExecutor(this.db);
    const [existing] = await ex
      .select({ id: role.id })
      .from(role)
      .where(eq(role.name, name))
      .limit(1);
    if (existing) return existing.id;

    const [created] = await ex
      .insert(role)
      .values({ name, createdBy: actor.id, updatedBy: actor.id })
      .returning({ id: role.id });
    return (created as { id: string }).id;
  }

  private async bumpBoundUsers(roleId: string): Promise<void> {
    const ex = currentExecutor(this.db);
    await ex
      .update(user)
      .set({ permissionsVersion: sql`${user.permissionsVersion} + 1` })
      .where(
        inArray(
          user.id,
          ex
            .select({ id: userRole.userId })
            .from(userRole)
            .where(eq(userRole.roleId, roleId)),
        ),
      );
  }
}

/** Read the first worksheet's columns A/B into raw rows (1-indexed row numbers). */
async function readWorkbook(buffer: Buffer): Promise<RawImportRow[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's typings predate the generic `Buffer<ArrayBufferLike>`; the value is a
  // real Node Buffer either way.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError("The workbook has no worksheets");

  const raws: RawImportRow[] = [];
  ws.eachRow((row, rowNumber) => {
    raws.push({
      rowNumber,
      roleName: cellText(row.getCell(1).value),
      codesRaw: cellText(row.getCell(2).value),
    });
  });
  return raws;
}

/** Coerce an exceljs cell value to plain text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "text" in value) {
    return String((value as { text: unknown }).text);
  }
  return String(value);
}
