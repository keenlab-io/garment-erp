import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import { subscription, subscriptionInvoice, tenant, type Db, type Tx } from "@erp/db";
import { format } from "@erp/utils";
import { DB } from "../../db/db.tokens.js";
import { onCommit } from "../../db/tx-context.js";
import { UnitOfWork } from "../../db/unit-of-work.service.js";
import {
  bangkokDate,
  dueTouch,
  dueTransitions,
  graceEnd,
  hasEvent,
  parseDunningEvents,
  reminderMessage,
  renewalDue,
  type DunningConfig,
  type DunningEvent,
} from "./dunning-schedule.js";
import { SubscriptionInvoiceService } from "./subscription-invoice.service.js";
import { SubscriptionService, type SubscriptionRow } from "./subscription.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The earliest pre-expiry touchpoint (T−30) — a subscription further out has nothing due. */
const EARLIEST_TOUCH_DAYS = 30;

/** A reminder handed to delivery after the sweep's transaction commits. */
export interface DunningReminder {
  subscriptionId: string;
  tenantId: string;
  touch: NonNullable<DunningEvent["touch"]>;
  subject: string;
  text: string;
}

/**
 * Reminder delivery seam (design D5). The touch itself — the idempotence record and the in-app
 * banner state (the subscription status) — is what the sweep guarantees; delivery runs after
 * commit, so a rolled-back pass never sends. The control plane has no billing-contact address yet,
 * so delivery currently logs the reminder; an email transport plugs in here.
 */
@Injectable()
export class DunningNotifier {
  private readonly logger = new Logger(DunningNotifier.name);

  async send(reminder: DunningReminder): Promise<void> {
    this.logger.log(
      `dunning ${reminder.touch} for tenant ${reminder.tenantId} ` +
        `(subscription ${reminder.subscriptionId}): ${reminder.subject}`,
    );
  }
}

/** What one sweep pass did — returned for logs and tests. */
export interface DunningSweepResult {
  processed: number;
  transitions: number;
  renewalsIssued: number;
  reminders: number;
  failed: number;
}

/**
 * The `billing.dunning` sweep body (M9 §4, design D3/D5) — the ONLY writer of time-driven
 * subscription transitions. Each pass reads the truth and, per subscription, in one transaction
 * holding its row lock (so overlapping passes serialize):
 *
 * 1. applies the due transitions — `ACTIVE → IN_GRACE` past `term_end`, `IN_GRACE → EXPIRED` past
 *    `term_end + BILLING_GRACE_DAYS` (M8 tenant `READ_ONLY` via `SubscriptionService.transition`;
 *    never `SUSPENDED`);
 * 2. auto-issues the renewal invoice once `now ≥ term_end − BILLING_RENEWAL_LEAD_DAYS` (renewal
 *    lines, no setup fee) unless one is already recorded or a live invoice already covers the next
 *    period;
 * 3. records the latest reached reminder touch (T−30/T−14/T−7/T0, weekly in grace, once on
 *    `READ_ONLY` entry) and hands it to delivery after commit.
 *
 * Every renewal and touch is persisted in `subscription.dunning_events` keyed by `term_end`, so
 * restarts and re-runs never duplicate an invoice or a reminder. `CANCELLED` subscriptions are
 * never selected. A failing subscription is logged and skipped; the next pass retries it.
 */
@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly uow: UnitOfWork,
    private readonly subscriptions: SubscriptionService,
    private readonly invoices: SubscriptionInvoiceService,
    private readonly notifier: DunningNotifier,
    private readonly config: ConfigService,
  ) {}

  dunningConfig(): DunningConfig {
    return {
      graceDays: this.config.get<number>("BILLING_GRACE_DAYS") ?? 15,
      renewalLeadDays: this.config.get<number>("BILLING_RENEWAL_LEAD_DAYS") ?? 45,
    };
  }

  /** One sweep pass at `now`. */
  async sweep(now: Date = new Date()): Promise<DunningSweepResult> {
    const cfg = this.dunningConfig();
    const horizon = new Date(
      now.getTime() + Math.max(cfg.renewalLeadDays, EARLIEST_TOUCH_DAYS) * DAY_MS,
    );
    const candidates = await this.db
      .select({ id: subscription.id })
      .from(subscription)
      .where(
        and(
          ne(subscription.status, "CANCELLED"),
          sql`${subscription.deletedAt} IS NULL`,
          lte(subscription.termEnd, horizon),
        ),
      );

    const result: DunningSweepResult = {
      processed: 0,
      transitions: 0,
      renewalsIssued: 0,
      reminders: 0,
      failed: 0,
    };
    for (const { id } of candidates) {
      try {
        const r = await this.processOne(id, now, cfg);
        result.processed += 1;
        result.transitions += r.transitions;
        result.renewalsIssued += r.renewalIssued ? 1 : 0;
        result.reminders += r.reminder ? 1 : 0;
      } catch (err) {
        result.failed += 1;
        this.logger.error(`dunning failed for subscription ${id}: ${String(err)}`);
      }
    }
    return result;
  }

  /** Apply everything due at `now` to one subscription, in one transaction. */
  async processOne(
    id: string,
    now: Date,
    cfg: DunningConfig = this.dunningConfig(),
  ): Promise<{ transitions: number; renewalIssued: boolean; reminder: boolean }> {
    return this.uow.withTransaction(async (tx) => {
      let sub = await this.subscriptions.lock(tx, id);
      const outcome = { transitions: 0, renewalIssued: false, reminder: false };
      if (sub.status === "CANCELLED") return outcome;
      const events = parseDunningEvents(sub.dunningEvents);
      const added: DunningEvent[] = [];
      const at = now.toISOString();
      const term = sub.termEnd.toISOString();
      const readOnlyOn = graceEnd(sub.termEnd, cfg.graceDays);

      // 1. Time-driven transitions — staged, so a long outage still passes through IN_GRACE.
      for (const to of dueTransitions(sub.status, sub.termEnd, now, cfg.graceDays)) {
        const reason =
          to === "IN_GRACE"
            ? `Term ended ${bangkokDate(sub.termEnd)}; grace until ${bangkokDate(readOnlyOn)}`
            : `Grace period ended ${bangkokDate(readOnlyOn)} without payment`;
        await this.subscriptions.transition(sub.id, to, reason, null);
        sub = { ...sub, status: to };
        outcome.transitions += 1;
      }

      // 2. The renewal invoice, once per term.
      if (
        renewalDue(sub.status, sub.termEnd, now, cfg.renewalLeadDays) &&
        !hasEvent(events, "RENEWAL_ISSUED", sub.termEnd)
      ) {
        const existing = await this.renewalCovering(tx, sub);
        let invoiceId = existing;
        if (!existing) {
          const issued = await this.invoices.issue(
            { subscription_id: sub.id, due_date: bangkokDate(sub.termEnd) },
            null,
            { renewal: true },
          );
          invoiceId = issued.id;
          outcome.renewalIssued = true;
        }
        added.push({ kind: "RENEWAL_ISSUED", term_end: term, at, invoice_id: invoiceId });
      }

      // 3. The latest reached reminder touch, once per term.
      const touch = dueTouch(sub.status, sub.termEnd, now);
      if (touch && !hasEvent(events, "REMINDER", sub.termEnd, touch)) {
        const due = await this.outstanding(tx, sub);
        const [t] = await tx
          .select({ name: tenant.name })
          .from(tenant)
          .where(eq(tenant.id, sub.tenantId))
          .limit(1);
        const amountDue = format(due.amount, 2);
        const message = reminderMessage({
          touch,
          tenantName: t?.name ?? "customer",
          amountDue,
          termEnd: sub.termEnd,
          readOnlyOn,
          invoiceNumber: due.number,
          payment: this.invoices.vendorDetails(),
        });
        added.push({
          kind: "REMINDER",
          touch,
          term_end: term,
          at,
          invoice_id: due.invoiceId,
          amount_due: amountDue,
          read_only_on: bangkokDate(readOnlyOn),
        });
        const reminder: DunningReminder = {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          touch,
          ...message,
        };
        onCommit(() => this.notifier.send(reminder));
        outcome.reminder = true;
      }

      if (added.length > 0) {
        await tx
          .update(subscription)
          .set({ dunningEvents: [...events, ...added], updatedAt: now })
          .where(eq(subscription.id, sub.id));
      }
      return outcome;
    });
  }

  /** A live (non-void) invoice already billing beyond the current term, e.g. issued by an admin. */
  private async renewalCovering(tx: Tx, sub: SubscriptionRow): Promise<string | null> {
    const [row] = await tx
      .select({ id: subscriptionInvoice.id })
      .from(subscriptionInvoice)
      .where(
        and(
          eq(subscriptionInvoice.subscriptionId, sub.id),
          ne(subscriptionInvoice.status, "VOID"),
          gt(subscriptionInvoice.periodEnd, sub.termEnd),
          sql`${subscriptionInvoice.deletedAt} IS NULL`,
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  /** The newest unpaid invoice (amount + number), else the annual fee with no invoice. */
  private async outstanding(
    tx: Tx,
    sub: SubscriptionRow,
  ): Promise<{ amount: string; number: string | null; invoiceId: string | null }> {
    const [row] = await tx
      .select({
        id: subscriptionInvoice.id,
        number: subscriptionInvoice.number,
        total: subscriptionInvoice.total,
      })
      .from(subscriptionInvoice)
      .where(
        and(
          eq(subscriptionInvoice.subscriptionId, sub.id),
          eq(subscriptionInvoice.status, "ISSUED"),
          sql`${subscriptionInvoice.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(subscriptionInvoice.issuedAt))
      .limit(1);
    if (!row) return { amount: sub.annualFee, number: null, invoiceId: null };
    return { amount: row.total, number: row.number, invoiceId: row.id };
  }
}
