import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { and, eq } from "drizzle-orm";
import { stockMovement, type Db } from "@erp/db";
import { formatQty, toDecimal } from "@erp/utils";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import { UnitOfWork } from "../db/unit-of-work.service.js";
import type { DomainEvent } from "../events/domain-event.js";
import { CostingService } from "./costing.service.js";
import {
  DELIVERY_NOTE_ISSUED,
  DOCUMENT_VOIDED,
  INVOICE_ISSUED,
  type DocumentVoidedPayload,
  type SalesIssuedPayload,
} from "./inventory.events.js";
import { ItemService } from "./item.service.js";
import { LedgerService } from "./ledger.service.js";

/**
 * Sales-driven stock movements (task 5.7b, design D8b). Dormant until M5 emits
 * `InvoiceIssued`/`DeliveryNoteIssued` (optional stock OUT per inventory-linked line) and
 * `DocumentVoided` (compensating IN when the document had posted an OUT). Runs through the
 * same ledger path and is **idempotent on the document**: an already-issued document
 * no-ops, and a void only compensates an OUT once, so an M5 redelivery cannot double-post.
 */
@Injectable()
export class SalesStockSubscriber {
  private readonly logger = new Logger(SalesStockSubscriber.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly items: ItemService,
    private readonly costing: CostingService,
    private readonly ledger: LedgerService,
  ) {}

  @OnEvent(INVOICE_ISSUED)
  async onInvoiceIssued(event: DomainEvent<SalesIssuedPayload>): Promise<void> {
    await this.issueForSale(event.payload, event.actor_user_id);
  }

  @OnEvent(DELIVERY_NOTE_ISSUED)
  async onDeliveryNoteIssued(
    event: DomainEvent<SalesIssuedPayload>,
  ): Promise<void> {
    await this.issueForSale(event.payload, event.actor_user_id);
  }

  @OnEvent(DOCUMENT_VOIDED)
  async onDocumentVoided(
    event: DomainEvent<DocumentVoidedPayload>,
  ): Promise<void> {
    await this.compensate(event.payload.document_id, event.actor_user_id);
  }

  /** Post an OUT per stocked line at current cost (idempotent on the document). */
  private async issueForSale(
    payload: SalesIssuedPayload,
    actorUserId: string | null,
  ): Promise<void> {
    await this.uow.withTransaction(async () => {
      if (await this.hasMovement(payload.document_id, "OUT")) {
        this.logger.log(`sales OUT for ${payload.document_id} exists — skipping`);
        return;
      }
      for (const line of payload.lines) {
        const warehouseId =
          line.warehouse_id || (await this.items.defaultWarehouseId());
        const baseQty = await this.items.toBase(line.item_id, line.uom_id, line.qty);
        const it = await this.items.get(line.item_id);
        const balance = await this.ledger.loadBalance(line.item_id, warehouseId);
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
            itemId: line.item_id,
            warehouseId,
            lotId: seg.lotId,
            qty: seg.qty,
            unitCost: seg.unitCost,
            direction: "OUT",
            refType: "GOODS_ISSUE",
            refId: payload.document_id,
            allowNegative: true,
            actorUserId,
          });
        }
      }
    });
  }

  /** Reverse a document's OUT movements with compensating INs (idempotent). */
  private async compensate(
    documentId: string,
    actorUserId: string | null,
  ): Promise<void> {
    await this.uow.withTransaction(async () => {
      const ex = currentExecutor(this.db);
      if (await this.hasMovement(documentId, "IN")) {
        this.logger.log(`compensation for ${documentId} exists — skipping`);
        return;
      }
      const outs = await ex
        .select()
        .from(stockMovement)
        .where(
          and(
            eq(stockMovement.refType, "GOODS_ISSUE"),
            eq(stockMovement.refId, documentId),
            eq(stockMovement.direction, "OUT"),
          ),
        );
      for (const out of outs) {
        await this.ledger.post({
          itemId: out.itemId,
          warehouseId: out.warehouseId,
          lotId: out.lotId,
          qty: formatQty(toDecimal(out.qty).negated()),
          unitCost: out.unitCost,
          direction: "IN",
          refType: "GOODS_ISSUE",
          refId: documentId,
          actorUserId,
        });
      }
    });
  }

  private async hasMovement(
    refId: string,
    direction: "IN" | "OUT",
  ): Promise<boolean> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ id: stockMovement.id })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.refType, "GOODS_ISSUE"),
          eq(stockMovement.refId, refId),
          eq(stockMovement.direction, direction),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
