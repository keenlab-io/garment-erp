import { asc, eq } from "drizzle-orm";
import { docLine, type Db, type Tx } from "@erp/db";
import { and } from "drizzle-orm";
import type { ComputedLine } from "./totals.service.js";

type Executor = Db | Tx;
type ParentType = "QUOTATION" | "INVOICE";
type DocLineRow = typeof docLine.$inferSelect;

/** Insert the server-computed lines of a quotation/invoice, returning the persisted rows. */
export async function persistLines(
  ex: Executor,
  parentType: ParentType,
  parentId: string,
  lines: ComputedLine[],
): Promise<DocLineRow[]> {
  if (lines.length === 0) return [];
  return ex
    .insert(docLine)
    .values(
      lines.map((l) => ({
        parentType,
        parentId,
        itemId: l.input.item_id ?? null,
        description: l.input.description,
        qty: l.input.qty,
        unitPrice: l.input.unit_price,
        discount: l.input.discount ?? "0",
        lineTotal: l.line_total,
      })),
    )
    .returning();
}

/** Load a document's lines (stable order by id). */
export async function loadLines(
  ex: Executor,
  parentType: ParentType,
  parentId: string,
): Promise<DocLineRow[]> {
  return ex
    .select()
    .from(docLine)
    .where(and(eq(docLine.parentType, parentType), eq(docLine.parentId, parentId)))
    .orderBy(asc(docLine.id));
}
