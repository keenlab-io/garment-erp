import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { and, desc, eq } from "drizzle-orm";
import { bom, bomLine, stockMovement, type Db } from "@erp/db";
import { formatMoney, formatQty, toDecimal } from "@erp/utils";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import type { DomainEvent } from "../events/domain-event.js";
import { BomService } from "./bom.service.js";
import { CostingService } from "./costing.service.js";
import {
  INVENTORY_EVENTS,
  WORK_ORDER_COMPLETED,
  type WorkOrderCompletedPayload,
} from "./inventory.events.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";

/**
 * Backflush on production completion (task 5.7, design D8). Dormant until M4 emits
 * `WorkOrderCompleted`. In one transaction it posts the finished-goods IN (produced qty at
 * rolled-up cost) and a raw-material OUT per active-BOM line (`qty·produced·(1+scrap)` at
 * current cost), then emits `BackflushPosted`. **Idempotent on `wo_id`**: if a `BACKFLUSH`
 * movement already references the work order it no-ops, so an M4 redelivery cannot
 * double-post.
 */
@Injectable()
export class BackflushService {
  private readonly logger = new Logger(BackflushService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly items: ItemService,
    private readonly costing: CostingService,
    private readonly ledger: LedgerService,
    private readonly boms: BomService,
    private readonly events: EventBusService,
  ) {}

  @OnEvent(WORK_ORDER_COMPLETED)
  async onWorkOrderCompleted(
    event: DomainEvent<WorkOrderCompletedPayload>,
  ): Promise<void> {
    await this.backflush(event.payload, event.actor_user_id);
  }

  /** Post FG IN + RM OUT for a completed work order (idempotent on `wo_id`). */
  async backflush(
    payload: WorkOrderCompletedPayload,
    actorUserId: string | null,
  ): Promise<void> {
    await this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);

      const [existing] = await ex
        .select({ id: stockMovement.id })
        .from(stockMovement)
        .where(
          and(
            eq(stockMovement.refType, "BACKFLUSH"),
            eq(stockMovement.refId, payload.wo_id),
          ),
        )
        .limit(1);
      if (existing) {
        this.logger.log(`backflush for wo ${payload.wo_id} already posted — skipping`);
        return;
      }

      const warehouseId =
        payload.warehouse_id || (await this.items.defaultWarehouseId());
      const producedQty = formatQty(payload.qty_produced);

      const [activeBom] = await ex
        .select({ id: bom.id })
        .from(bom)
        .where(
          and(
            eq(bom.finishedItemId, payload.finished_item_id),
            eq(bom.isActive, true),
          ),
        )
        .orderBy(desc(bom.version))
        .limit(1);

      // FG unit cost = rolled-up cost when a BOM exists, else the item's standard/avg cost.
      const fgUnitCost = activeBom
        ? (await this.boms.rollup(activeBom.id)).rolled_up_cost
        : await this.flatCost(payload.finished_item_id, warehouseId);

      await this.ledger.post({
        itemId: payload.finished_item_id,
        warehouseId,
        qty: producedQty,
        unitCost: fgUnitCost,
        direction: "IN",
        refType: "BACKFLUSH",
        refId: payload.wo_id,
        actorUserId,
      });

      if (activeBom) {
        const lines = await ex
          .select()
          .from(bomLine)
          .where(eq(bomLine.bomId, activeBom.id));
        for (const line of lines) {
          const perUnit = toDecimal(line.qty).times(
            toDecimal("1").plus(toDecimal(line.scrapPct)),
          );
          const consumedUom = formatQty(perUnit.times(toDecimal(producedQty)));
          const baseQty = await this.items.toBase(
            line.rawItemId,
            line.uomId,
            consumedUom,
          );
          const it = await this.items.get(line.rawItemId);
          const balance = await this.ledger.loadBalance(line.rawItemId, warehouseId);
          const segments = await this.costing.resolveIssue(
            {
              id: it.id,
              costingMethod: it.costing_method,
              standardCost: it.standard_cost,
            },
            baseQty,
            balance.avgCost,
          );
          for (const seg of segments) {
            await this.ledger.post({
              itemId: line.rawItemId,
              warehouseId,
              lotId: seg.lotId,
              qty: seg.qty,
              unitCost: seg.unitCost,
              direction: "OUT",
              refType: "BACKFLUSH",
              refId: payload.wo_id,
              allowNegative: true, // production already consumed the material
              actorUserId,
            });
          }
        }
      }

      this.events.publishAfterCommit(
        makeEvent({
          event: INVENTORY_EVENTS.backflushPosted,
          actorUserId,
          payload: {
            wo_id: payload.wo_id,
            finished_item_id: payload.finished_item_id,
            warehouse_id: warehouseId,
            qty_produced: producedQty,
          },
        }),
      );
    });
  }

  /** Flat cost fallback when a finished item has no active BOM. */
  private async flatCost(itemId: string, warehouseId: string): Promise<string> {
    const balance = await this.ledger.loadBalance(itemId, warehouseId);
    if (toDecimal(balance.avgCost).greaterThan(0)) return formatMoney(balance.avgCost);
    const it = await this.items.get(itemId);
    return formatMoney(it.standard_cost ?? "0");
  }
}
