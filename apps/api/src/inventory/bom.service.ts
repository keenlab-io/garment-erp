import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { bom, bomLine, item, stockBalance, type Db } from "@erp/db";
import type {
  Bom,
  CreateBomRequest,
  RollupComponent,
  RollupResult,
} from "@erp/contracts";
import { formatMoney, formatQty, lineTotal, sumMoney, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { m, mN, q } from "./inventory.util.js";
import { ItemService } from "./item.service.js";

/**
 * Bills of materials (task 5.6). `create` versions a BOM per finished item; `rollup` is a
 * read-only recursive cost walk — each component contributes `qty·(1+scrap)·unit_cost`,
 * where a component that is itself a produced item rolls up its own active BOM, and the
 * finished cost adds the header `conversion_cost`. Writes no ledger rows (design D11).
 */
@Injectable()
export class BomService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly items: ItemService,
  ) {}

  async create(input: CreateBomRequest, _actor: AuthUser): Promise<Bom> {
    const ex = currentExecutor(this.db);

    const [prev] = await ex
      .select({ version: bom.version })
      .from(bom)
      .where(eq(bom.finishedItemId, input.finished_item_id))
      .orderBy(desc(bom.version))
      .limit(1);
    const version = (prev?.version ?? 0) + 1;

    const [header] = await ex
      .insert(bom)
      .values({
        finishedItemId: input.finished_item_id,
        version,
        conversionCost: input.conversion_cost ?? null,
        isActive: true,
      })
      .returning({ id: bom.id });
    if (!header) throw new StateConflictError("BOM could not be created");

    await ex.insert(bomLine).values(
      input.lines.map((l) => ({
        bomId: header.id,
        rawItemId: l.item_id,
        qty: formatQty(l.qty),
        uomId: l.uom_id,
        scrapPct: l.scrap_pct,
      })),
    );

    return this.load(header.id);
  }

  async rollup(id: string): Promise<RollupResult> {
    const header = await this.loadHeader(id);
    const warehouseId = await this.items.defaultWarehouseId();
    const components = await this.rollupComponents(id, warehouseId, new Set([
      header.finishedItemId,
    ]));

    const materials = sumMoney([
      "0",
      ...components.map((c) => c.extended_cost),
    ]);
    const conversion = formatMoney(header.conversionCost ?? "0");
    const rolledUp = sumMoney([materials, conversion]);

    return {
      bom_id: id,
      finished_item_id: header.finishedItemId,
      conversion_cost: m(conversion),
      rolled_up_cost: m(rolledUp),
      components,
    };
  }

  /** The component contributions of one BOM. */
  private async rollupComponents(
    bomId: string,
    warehouseId: string,
    visited: Set<string>,
  ): Promise<RollupComponent[]> {
    const ex = currentExecutor(this.db);
    const lines = await ex
      .select()
      .from(bomLine)
      .where(eq(bomLine.bomId, bomId))
      .orderBy(bomLine.id);

    const out: RollupComponent[] = [];
    for (const line of lines) {
      const unitCost = await this.costOf(line.rawItemId, warehouseId, visited);
      const effectiveQty = formatQty(
        toDecimal(line.qty).times(toDecimal("1").plus(toDecimal(line.scrapPct))),
      );
      out.push({
        item_id: line.rawItemId,
        qty: q(line.qty),
        scrap_pct: q(line.scrapPct),
        unit_cost: m(unitCost),
        extended_cost: m(lineTotal(effectiveQty, unitCost)),
      });
    }
    return out;
  }

  /**
   * Current unit cost of an item for roll-up: a produced item with an active BOM rolls up
   * that BOM; otherwise the moving-average on-hand cost, falling back to `standard_cost`,
   * then zero. A cycle (item already on the path) falls back to the flat cost.
   */
  private async costOf(
    itemId: string,
    warehouseId: string,
    visited: Set<string>,
  ): Promise<string> {
    const ex = currentExecutor(this.db);

    if (!visited.has(itemId)) {
      const [activeBom] = await ex
        .select({ id: bom.id, conversionCost: bom.conversionCost })
        .from(bom)
        .where(and(eq(bom.finishedItemId, itemId), eq(bom.isActive, true)))
        .orderBy(desc(bom.version))
        .limit(1);
      if (activeBom) {
        const next = new Set(visited).add(itemId);
        const components = await this.rollupComponents(activeBom.id, warehouseId, next);
        return sumMoney([
          formatMoney(activeBom.conversionCost ?? "0"),
          ...components.map((c) => c.extended_cost),
        ]);
      }
    }

    const [bal] = await ex
      .select({ avgCost: stockBalance.avgCost })
      .from(stockBalance)
      .where(
        and(eq(stockBalance.itemId, itemId), eq(stockBalance.warehouseId, warehouseId)),
      )
      .limit(1);
    if (bal && toDecimal(bal.avgCost).greaterThan(0)) return formatMoney(bal.avgCost);

    const [it] = await ex
      .select({ standardCost: item.standardCost })
      .from(item)
      .where(eq(item.id, itemId))
      .limit(1);
    return formatMoney(it?.standardCost ?? "0");
  }

  private async loadHeader(id: string): Promise<typeof bom.$inferSelect> {
    const ex = currentExecutor(this.db);
    const [header] = await ex.select().from(bom).where(eq(bom.id, id)).limit(1);
    if (!header) throw new NotFoundError("BOM not found");
    return header;
  }

  private async load(id: string): Promise<Bom> {
    const ex = currentExecutor(this.db);
    const header = await this.loadHeader(id);
    const lines = await ex
      .select()
      .from(bomLine)
      .where(eq(bomLine.bomId, id))
      .orderBy(bomLine.id);

    return {
      id: header.id,
      finished_item_id: header.finishedItemId,
      version: header.version,
      is_active: header.isActive,
      conversion_cost: mN(header.conversionCost),
      lines: lines.map((l) => ({
        id: l.id,
        item_id: l.rawItemId,
        uom_id: l.uomId,
        qty: q(l.qty),
        scrap_pct: q(l.scrapPct),
      })),
    };
  }
}
