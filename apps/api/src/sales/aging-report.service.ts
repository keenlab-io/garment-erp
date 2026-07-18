import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { customer, invoice, type Db } from "@erp/db";
import { sumMoney, toDecimal } from "@erp/utils";
import { asMoney, type AgingReportQuery, type AgingReportRow } from "@erp/contracts";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";

const MS_PER_DAY = 86_400_000;
type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "over_90";

/**
 * Aging report (task 5.9, design D11) — a read-only credit-terms view. For every open invoice
 * (ISSUED / PARTIALLY_PAID / OVERDUE) the outstanding balance (`grand − wht − amount_paid`) is
 * bucketed by days past `due_date` as of `as_of` (default now): current (not yet due) / 1-30 /
 * 31-60 / 61-90 / 90+ — grouped per customer. Needs no scheduler.
 */
@Injectable()
export class AgingReportService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async report(query: AgingReportQuery): Promise<AgingReportRow[]> {
    const ex = currentExecutor(this.db);
    const asOf = query.as_of ? new Date(query.as_of) : new Date();

    const rows = await ex
      .select({
        customerId: invoice.customerId,
        customerName: customer.name,
        grandTotal: invoice.grandTotal,
        whtAmount: invoice.whtAmount,
        amountPaid: invoice.amountPaid,
        dueDate: invoice.dueDate,
      })
      .from(invoice)
      .innerJoin(customer, eq(invoice.customerId, customer.id))
      .where(
        and(inArray(invoice.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])),
      );

    // customer_id → { name, bucket → list of outstanding strings }
    const byCustomer = new Map<
      string,
      { name: string; buckets: Record<Bucket, string[]> }
    >();

    for (const r of rows) {
      const outstanding = toDecimal(r.grandTotal)
        .minus(toDecimal(r.whtAmount))
        .minus(toDecimal(r.amountPaid));
      if (outstanding.lessThanOrEqualTo(0)) continue;

      const entry =
        byCustomer.get(r.customerId) ??
        {
          name: r.customerName,
          buckets: { current: [], d1_30: [], d31_60: [], d61_90: [], over_90: [] },
        };
      entry.buckets[bucketFor(r.dueDate, asOf)].push(outstanding.toString());
      byCustomer.set(r.customerId, entry);
    }

    return [...byCustomer.entries()].map(([customerId, e]) => ({
      customer_id: customerId,
      customer_name: e.name,
      current: asMoney(sumMoney(e.buckets.current)),
      d1_30: asMoney(sumMoney(e.buckets.d1_30)),
      d31_60: asMoney(sumMoney(e.buckets.d31_60)),
      d61_90: asMoney(sumMoney(e.buckets.d61_90)),
      over_90: asMoney(sumMoney(e.buckets.over_90)),
    }));
  }
}

/** Which aging bucket an invoice falls in, by days past `due_date` as of `asOf`. */
function bucketFor(dueDate: string | null, asOf: Date): Bucket {
  if (!dueDate) return "current";
  const due = new Date(`${dueDate}T00:00:00.000Z`);
  const days = Math.floor((asOf.getTime() - due.getTime()) / MS_PER_DAY);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "over_90";
}
