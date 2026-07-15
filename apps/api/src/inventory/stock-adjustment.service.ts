import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  stockAdjustment,
  stockAdjustmentLine,
  type Db,
} from "@erp/db";
import type {
  CreateStockAdjustmentRequest,
  StockAdjustment,
  StockAdjustmentLineInput,
} from "@erp/contracts";
import { formatMoney, formatQty } from "@erp/utils";
import type { AuthUser } from "../auth/auth-user.js";
import { AuditService } from "../audit/audit.service.js";
import {
  NotFoundError,
  StateConflictError,
  ValidationError,
} from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { EventBusService } from "../events/event-bus.service.js";
import { makeEvent } from "../events/domain-event.js";
import { INVENTORY_EVENTS } from "./inventory.events.js";
import { q } from "./inventory.util.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";

/**
 * Reason-gated stock adjustments (task 5.9). A blank reason is rejected 400 before any
 * write. DRAFT → APPROVED (`inventory.adjustment.approve`) → POSTED (one ADJUST movement
 * per line at the current average cost, plus **one** `audit_log` row carrying actor +
 * reason + before/after balances). Emits `StockAdjusted` after commit.
 */
@Injectable()
export class StockAdjustmentService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly items: ItemService,
    private readonly ledger: LedgerService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
  ) {}

  async create(
    input: CreateStockAdjustmentRequest,
    _actor: AuthUser,
  ): Promise<StockAdjustment> {
    return this.createDraft(input.reason, input.lines);
  }

  /** Create a DRAFT adjustment from a reason + signed line deltas (shared with count reconcile). */
  async createDraft(
    reason: string,
    lines: StockAdjustmentLineInput[],
  ): Promise<StockAdjustment> {
    if (!reason.trim()) {
      throw new ValidationError("A reason is required for a stock adjustment", [
        { field: "reason", issue: "must not be blank" },
      ]);
    }
    const ex = currentExecutor(this.db);
    const warehouseId = await this.items.defaultWarehouseId();

    const [header] = await ex
      .insert(stockAdjustment)
      .values({ reason: reason.trim(), status: "DRAFT" })
      .returning({ id: stockAdjustment.id });
    if (!header) throw new StateConflictError("Adjustment could not be created");

    await ex.insert(stockAdjustmentLine).values(
      lines.map((l) => ({
        adjustmentId: header.id,
        itemId: l.item_id,
        warehouseId: l.warehouse_id ?? warehouseId,
        deltaQty: formatQty(l.qty_delta),
      })),
    );

    return this.load(header.id);
  }

  async approve(id: string, actor: AuthUser): Promise<StockAdjustment> {
    const ex = currentExecutor(this.db);
    const adj = await this.load(id);
    if (adj.status !== "DRAFT") {
      throw new StateConflictError(`Cannot approve a ${adj.status} adjustment`);
    }
    await ex
      .update(stockAdjustment)
      .set({ status: "APPROVED", approvedBy: actor.id })
      .where(eq(stockAdjustment.id, id));
    return this.load(id);
  }

  async post(id: string, actor: AuthUser): Promise<StockAdjustment> {
    const ex = currentExecutor(this.db);
    const adj = await this.load(id);
    if (adj.status === "POSTED") {
      throw new StateConflictError("Adjustment is already posted");
    }
    if (adj.status !== "APPROVED") {
      throw new StateConflictError("Adjustment must be approved before posting");
    }

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};

    for (const line of adj.lines) {
      const key = `${line.item_id}@${line.warehouse_id}`;
      const balance = await this.ledger.loadBalance(line.item_id, line.warehouse_id);
      before[key] = balance.qtyOnHand;
      const result = await this.ledger.post({
        itemId: line.item_id,
        warehouseId: line.warehouse_id,
        qty: line.qty_delta,
        unitCost: formatMoney(balance.avgCost),
        direction: "ADJUST",
        refType: "ADJUSTMENT",
        refId: id,
        allowNegative: true,
        actorUserId: actor.id,
      });
      after[key] = result.qtyOnHand;
    }

    await ex
      .update(stockAdjustment)
      .set({ status: "POSTED" })
      .where(eq(stockAdjustment.id, id));

    // Exactly one audit row for the whole adjustment (actor + reason + before/after).
    await this.audit.record({
      action: "UPDATE",
      entityType: "stock_adjustment",
      entityId: id,
      actorUserId: actor.id,
      reason: adj.reason,
      before,
      after,
    });

    this.events.publishAfterCommit(
      makeEvent({
        event: INVENTORY_EVENTS.stockAdjusted,
        actorUserId: actor.id,
        payload: { adjustment_id: id },
      }),
    );

    return this.load(id);
  }

  private async load(id: string): Promise<StockAdjustment> {
    const ex = currentExecutor(this.db);
    const [header] = await ex
      .select()
      .from(stockAdjustment)
      .where(eq(stockAdjustment.id, id))
      .limit(1);
    if (!header) throw new NotFoundError("Stock adjustment not found");

    const lines = await ex
      .select()
      .from(stockAdjustmentLine)
      .where(eq(stockAdjustmentLine.adjustmentId, id));

    return {
      id: header.id,
      reason: header.reason,
      status: header.status,
      version: 0,
      lines: lines.map((l) => ({
        id: `${l.adjustmentId}:${l.itemId}:${l.warehouseId}`,
        item_id: l.itemId,
        warehouse_id: l.warehouseId,
        qty_delta: q(l.deltaQty),
      })),
    };
  }
}
