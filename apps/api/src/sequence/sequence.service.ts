import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { documentSequence, type Db } from "@erp/db";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";

/**
 * Race-safe document numbering (design D9). `next(key)` runs inside a transaction,
 * locks the single `document_sequence` row with `SELECT … FOR UPDATE`, applies the
 * yearly reset if configured, increments, and renders the format template — so
 * concurrent callers never produce a duplicate number.
 */
@Injectable()
export class SequenceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
  ) {}

  async next(key: string): Promise<string> {
    return this.uow.withTransaction(async () => {
      const executor = currentExecutor(this.db);
      const rows = await executor
        .select()
        .from(documentSequence)
        .where(eq(documentSequence.key, key))
        .for("update");
      const row = rows[0];
      if (!row) throw new NotFoundError(`Unknown document sequence: ${key}`);

      const currentYear = new Date().getFullYear();
      let nextValue: number;
      let yearScope = row.yearScope;
      if (row.resetYearly && row.yearScope !== currentYear) {
        nextValue = 1;
        yearScope = currentYear;
      } else {
        nextValue = row.currentValue + 1;
      }

      await executor
        .update(documentSequence)
        .set({ currentValue: nextValue, yearScope })
        .where(eq(documentSequence.key, key));

      return renderSequenceFormat(row.format, {
        prefix: row.prefix,
        year: yearScope,
        seq: nextValue,
        padding: row.padding,
      });
    });
  }
}

export interface SequenceFormatContext {
  prefix: string;
  year: number;
  seq: number;
  padding: number;
}

/**
 * Render a document number from a format template. Tokens:
 * - `{prefix}`   → the sequence prefix
 * - `{yyyy}`     → 4-digit year
 * - `{seq:0000}` → sequence zero-padded to the given width
 * - `{seq}`      → sequence zero-padded to the row's default `padding`
 */
export function renderSequenceFormat(
  format: string,
  ctx: SequenceFormatContext,
): string {
  return format
    .replace(/\{prefix\}/g, ctx.prefix)
    .replace(/\{yyyy\}/g, String(ctx.year))
    .replace(/\{seq:(0+)\}/g, (_match, zeros: string) =>
      String(ctx.seq).padStart(zeros.length, "0"),
    )
    .replace(/\{seq\}/g, String(ctx.seq).padStart(ctx.padding, "0"));
}
