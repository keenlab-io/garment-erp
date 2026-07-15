import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { ConfigService } from "@nestjs/config";
import {
  goodsIssue,
  goodsIssueLine,
  stockMovement,
  type Db,
} from "@erp/db";
import type { CreateGoodsIssueRequest, GoodsIssue } from "@erp/contracts";
import { divideMoney, formatMoney, formatQty, toDecimal } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import {
  BusinessRuleError,
  NotFoundError,
  StateConflictError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { CostingService } from "./costing.service.js";
import { INVENTORY_EVENTS } from "./inventory.events.js";
import { docCode, m, q } from "./inventory.util.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";

/**
 * Goods issues (task 5.5). DRAFT → POSTED (OUT movements costed per the item's costing
 * method). Before any ledger write, an issue exceeding on-hand is rejected 422 unless
 * `INVENTORY_ALLOW_NEGATIVE_STOCK` is set (design D7). Emits `GoodsIssued` after commit.
 */
@Injectable()
export class GoodsIssueService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly items: ItemService,
    private readonly costing: CostingService,
    private readonly ledger: LedgerService,
    private readonly events: EventBusService,
  ) {}

  async create(
    input: CreateGoodsIssueRequest,
    _actor: AuthUser,
  ): Promise<GoodsIssue> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .insert(goodsIssue)
      .values({
        purpose: input.purpose,
        refWoId: input.ref_wo_id ?? null,
        status: "DRAFT",
      })
      .returning({ id: goodsIssue.id });
    if (!header) throw new StateConflictError("Issue could not be created");

    await ex
      .update(goodsIssue)
      .set({ docNo: docCode("GI", header.id) })
      .where(eq(goodsIssue.id, header.id));

    await ex.insert(goodsIssueLine).values(
      input.lines.map((l) => ({
        issueId: header.id,
        itemId: l.item_id,
        qty: formatQty(l.qty),
        uomId: l.uom_id,
      })),
    );

    return this.load(header.id);
  }

  /** Post OUT movements; move DRAFT → POSTED. 422 on insufficient stock. */
  async post(id: string, actor: AuthUser): Promise<GoodsIssue> {
    const ex = currentExecutor(this.db);
    const issue = await this.load(id);
    if (issue.status === "POSTED") {
      throw new StateConflictError("Issue is already posted");
    }
    if (issue.status !== "DRAFT") {
      throw new StateConflictError("Only a draft issue can be posted");
    }

    const allowNegative =
      this.config.get<boolean>("INVENTORY_ALLOW_NEGATIVE_STOCK") ?? false;
    const warehouseId = await this.items.defaultWarehouseId();

    for (const line of issue.lines) {
      const baseQty = await this.items.toBase(line.item_id, line.uom_id, line.qty);
      const it = await this.items.get(line.item_id);
      const balance = await this.ledger.loadBalance(line.item_id, warehouseId);

      if (
        !allowNegative &&
        toDecimal(balance.qtyOnHand).lessThan(toDecimal(baseQty))
      ) {
        throw new BusinessRuleError(
          "Insufficient stock: issuing more than on-hand is not allowed",
        );
      }

      const segments = await this.costing.resolveIssue(
        { id: it.id, costingMethod: it.costing_method, standardCost: it.standard_cost },
        baseQty,
        balance.avgCost,
      );

      for (const seg of segments) {
        await this.ledger.post({
          itemId: line.item_id,
          warehouseId,
          lotId: seg.lotId,
          qty: seg.qty,
          unitCost: seg.unitCost,
          direction: "OUT",
          refType: "GOODS_ISSUE",
          refId: id,
          allowNegative: true, // already guarded at the aggregate level above
          actorUserId: actor.id,
        });
      }
    }

    await ex.update(goodsIssue).set({ status: "POSTED" }).where(eq(goodsIssue.id, id));

    this.events.publishAfterCommit(
      makeEvent({
        event: INVENTORY_EVENTS.goodsIssued,
        actorUserId: actor.id,
        payload: { issue_id: id, warehouse_id: warehouseId },
      }),
    );

    return this.load(id);
  }

  async list(
    limit: number,
  ): Promise<{ data: GoodsIssue[]; next_cursor: string | null }> {
    const ex = currentExecutor(this.db);
    const rows = await ex
      .select({ id: goodsIssue.id })
      .from(goodsIssue)
      .orderBy(goodsIssue.id)
      .limit(limit);
    const data = await Promise.all(rows.map((r) => this.load(r.id)));
    return { data, next_cursor: null };
  }

  /** Load an issue with its lines; each line's `unit_cost` is derived from its movements. */
  private async load(id: string): Promise<GoodsIssue> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .select()
      .from(goodsIssue)
      .where(eq(goodsIssue.id, id))
      .limit(1);
    if (!header) throw new NotFoundError("Goods issue not found");

    const lines = await ex
      .select()
      .from(goodsIssueLine)
      .where(eq(goodsIssueLine.issueId, id))
      .orderBy(goodsIssueLine.id);

    const result = [];
    for (const l of lines) {
      result.push({
        id: l.id,
        item_id: l.itemId,
        uom_id: l.uomId,
        qty: q(l.qty),
        unit_cost: m(await this.issuedUnitCost(id, l.itemId)),
      });
    }

    return {
      id: header.id,
      code: header.docNo ?? docCode("GI", header.id),
      purpose: header.purpose,
      ref_wo_id: header.refWoId,
      status: header.status,
      version: 0,
      lines: result,
    };
  }

  /** Weighted-average OUT cost this issue posted for `item` (0 before posting). */
  private async issuedUnitCost(issueId: string, itemId: string): Promise<string> {
    const ex = currentExecutor(this.db);
    const [agg] = await ex
      .select({
        value: sql<string>`coalesce(sum(${stockMovement.qty} * ${stockMovement.unitCost}), 0)`,
        qty: sql<string>`coalesce(sum(${stockMovement.qty}), 0)`,
      })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.refType, "GOODS_ISSUE"),
          eq(stockMovement.refId, issueId),
          eq(stockMovement.itemId, itemId),
        ),
      );
    if (!agg || toDecimal(agg.qty).isZero()) return formatMoney("0");
    return divideMoney(agg.value, agg.qty);
  }
}
