import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { item, sku, uom, uomConversion, warehouse, type Db } from "@erp/db";
import type {
  CreateItemRequest,
  CreateSkuRequest,
  CreateUomConversionRequest,
  Item,
  ItemsQuery,
  Sku,
  UomConversion,
} from "@erp/contracts";
import { formatQty, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
  ValidationError,
} from "../common/errors/app-exception.js";
import { buildPage } from "../common/pagination/cursor.js";
import { decodeItemCursor, mN, q, qN } from "./inventory.util.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { SequenceService } from "../sequence/sequence.service.js";

/** Row → `Item` DTO. `attributes` is a free-form jsonb bag. */
function toItemDto(row: typeof item.$inferSelect): Item {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    item_type: row.itemType,
    base_uom_id: row.baseUomId,
    costing_method: row.costingMethod,
    standard_cost: mN(row.standardCost),
    min_stock: qN(row.minStock),
    attributes: (row.attributes ?? {}) as Record<string, unknown>,
    version: row.version,
  };
}

/**
 * Item catalog + unit-of-measure administration (spec §3.2, task 5.1). Item codes are
 * auto-issued as `AA00001` via `SequenceService.next('ITEM')`; SKU codes are auto-issued
 * too. `toBase` converts any line quantity into the item's base UOM via `uom_conversion`
 * **before** the ledger sees it (invariant §3.5).
 */
@Injectable()
export class ItemService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sequences: SequenceService,
  ) {}

  /**
   * The warehouse inventory documents post to. Receipts/issues/counts carry no warehouse
   * on the wire (single-warehouse M3), so movements land in the first (seeded default)
   * warehouse. 422 if none exists — the seed must have run.
   */
  async defaultWarehouseId(): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: warehouse.id })
      .from(warehouse)
      .orderBy(asc(warehouse.name))
      .limit(1);
    if (!row) throw new ValidationError("No warehouse is configured");
    return row.id;
  }

  async get(id: string): Promise<Item> {
    const ex = currentExecutor(this.db);
    const [row] = await ex.select().from(item).where(eq(item.id, id)).limit(1);
    if (!row) throw new NotFoundError("Item not found");
    return toItemDto(row);
  }

  async create(input: CreateItemRequest, actor: AuthUser): Promise<Item> {
    const ex = currentExecutor(this.db);

    const [base] = await ex
      .select({ id: uom.id })
      .from(uom)
      .where(eq(uom.id, input.base_uom_id))
      .limit(1);
    if (!base) throw new ValidationError("Unknown base_uom_id");

    const code = await this.sequences.next("ITEM");
    const [row] = await ex
      .insert(item)
      .values({
        code,
        name: input.name,
        itemType: input.item_type,
        baseUomId: input.base_uom_id,
        costingMethod: input.costing_method ?? "MAV",
        standardCost: input.standard_cost ?? null,
        minStock: input.min_stock ?? null,
        attributes: input.attributes,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    if (!row) throw new StateConflictError("Item could not be created");
    return toItemDto(row);
  }

  async list(query: ItemsQuery): Promise<{ data: Item[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const decoded = query.cursor ? decodeItemCursor(query.cursor) : null;
    const filters = [
      query["filter[item_type]"]
        ? eq(item.itemType, query["filter[item_type]"])
        : undefined,
      decoded
        ? sql`(${item.createdAt}, ${item.id}) < (${new Date(decoded.createdAt)}, ${decoded.id})`
        : undefined,
    ].filter(Boolean);

    const rows = await ex
      .select()
      .from(item)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(item.createdAt), desc(item.id))
      .limit(query.limit + 1);

    const page = buildPage(rows, query.limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));
    return { data: page.data.map(toItemDto), next_cursor: page.next_cursor };
  }

  async createSku(itemId: string, input: CreateSkuRequest): Promise<Sku> {
    const ex = currentExecutor(this.db);
    await this.get(itemId); // 404 if the item does not exist

    const skuCode = await this.sequences.next("ITEM");
    const [row] = await ex
      .insert(sku)
      .values({
        itemId,
        skuCode: `SKU-${skuCode}`,
        variant: { label: input.variant },
        barcode: input.barcode ?? null,
      })
      .returning();
    if (!row) throw new StateConflictError("SKU could not be created");
    return {
      id: row.id,
      item_id: row.itemId,
      sku_code: row.skuCode,
      variant: input.variant,
      barcode: row.barcode,
    };
  }

  async createConversion(
    input: CreateUomConversionRequest,
  ): Promise<UomConversion> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .insert(uomConversion)
      .values({
        itemId: input.item_id,
        fromUom: input.from_uom,
        toUom: input.to_uom,
        factor: formatQty(input.factor),
      })
      .returning();
    if (!row) throw new StateConflictError("Conversion could not be created");
    return {
      id: `${row.itemId}:${row.fromUom}:${row.toUom}`,
      item_id: row.itemId,
      from_uom: row.fromUom,
      to_uom: row.toUom,
      factor: q(row.factor),
    };
  }

  /**
   * Convert `qty` (in `fromUomId`) to the item's base UOM. A base-UOM line converts 1:1;
   * otherwise the `(item, from, base)` `uom_conversion` factor is applied. A missing
   * factor is a 422 — posting a line in an unconvertible unit is a business-rule error.
   */
  async toBase(itemId: string, fromUomId: string, qty: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ baseUomId: item.baseUomId })
      .from(item)
      .where(eq(item.id, itemId))
      .limit(1);
    if (!row) throw new NotFoundError("Item not found");
    if (row.baseUomId === fromUomId) return formatQty(qty);

    const [conv] = await ex
      .select({ factor: uomConversion.factor })
      .from(uomConversion)
      .where(
        and(
          eq(uomConversion.itemId, itemId),
          eq(uomConversion.fromUom, fromUomId),
          eq(uomConversion.toUom, row.baseUomId),
        ),
      )
      .limit(1);
    if (!conv) {
      throw new ValidationError(
        "No UOM conversion to the item's base unit is registered",
      );
    }
    return formatQty(toDecimal(qty).times(toDecimal(conv.factor)));
  }
}
