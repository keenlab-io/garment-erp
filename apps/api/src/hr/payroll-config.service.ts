import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lte } from "drizzle-orm";
import { advancePolicy, otRate, ssoConfig, taxBracket, type Db } from "@erp/db";
import { NotFoundError } from "../common/errors/app-exception.js";
import { DB } from "../db/db.tokens.js";
import { currentExecutor } from "../db/tx-context.js";
import type { TaxBracket } from "./payroll-math.js";
import { today } from "./hr.util.js";

/**
 * Effective-dated payroll config resolution (design D3, task 4.9). All parameters
 * (tax/SSO/OT/advance) are **non-authoritative** admin-editable rows; the engine selects
 * the current-effective values (`effective_date <= asOf`) at calculation time and
 * snapshots them into `payslip.breakdown`. Read-only — the seed provisions dev defaults;
 * the contract exposes no config CRUD endpoints.
 */
@Injectable()
export class PayrollConfigService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The current-effective progressive tax schedule (all bands sharing the latest date). */
  async taxBrackets(asOf: string = today()): Promise<TaxBracket[]> {
    const ex = currentExecutor(this.db);
    const [latest] = await ex
      .select({ effectiveDate: taxBracket.effectiveDate })
      .from(taxBracket)
      .where(lte(taxBracket.effectiveDate, asOf))
      .orderBy(desc(taxBracket.effectiveDate))
      .limit(1);
    if (!latest) return [];
    const bands = await ex
      .select()
      .from(taxBracket)
      .where(eq(taxBracket.effectiveDate, latest.effectiveDate))
      .orderBy(taxBracket.lowerBound);
    return bands.map((b) => ({
      lowerBound: b.lowerBound,
      upperBound: b.upperBound,
      rate: b.rate,
    }));
  }

  /** The current-effective SSO config row. */
  async ssoConfig(
    asOf: string = today(),
  ): Promise<{ rate: string; wageFloor: string; wageCeiling: string }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(ssoConfig)
      .where(lte(ssoConfig.effectiveDate, asOf))
      .orderBy(desc(ssoConfig.effectiveDate))
      .limit(1);
    if (!row) throw new NotFoundError("No effective SSO config");
    return { rate: row.rate, wageFloor: row.wageFloor, wageCeiling: row.wageCeiling };
  }

  /** The current-effective multiplier for an OT `rate_type` (e.g. `WEEKDAY_1_5`). */
  async otMultiplier(rateType: string, asOf: string = today()): Promise<string> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select({ multiplier: otRate.multiplier })
      .from(otRate)
      .where(and(eq(otRate.rateType, rateType), lte(otRate.effectiveDate, asOf)))
      .orderBy(desc(otRate.effectiveDate))
      .limit(1);
    if (!row) throw new NotFoundError(`No effective OT rate for ${rateType}`);
    return row.multiplier;
  }

  /** The current-effective cash-advance policy (ceiling % + max installments). */
  async advancePolicy(
    asOf: string = today(),
  ): Promise<{ ceilingPct: string; maxInstallments: number }> {
    const ex = currentExecutor(this.db);
    const [row] = await ex
      .select()
      .from(advancePolicy)
      .where(lte(advancePolicy.effectiveDate, asOf))
      .orderBy(desc(advancePolicy.effectiveDate))
      .limit(1);
    if (!row) throw new NotFoundError("No effective advance policy");
    return { ceilingPct: row.ceilingPct, maxInstallments: row.maxInstallments };
  }
}
