import { z } from "zod";
import { isValidScaled, MONEY_SCALE, QTY_SCALE } from "@erp/utils";

/**
 * Money / quantity zod schemas (spec §5.3 / §13).
 *
 * Values cross the wire as **strings** (never float). These schemas validate the
 * string shape and scale; arithmetic happens server-side via the decimal helpers
 * in @erp/utils. The branded types make it a compile error to pass a raw string
 * where a validated Money/Qty is expected.
 */

export type Money = string & { readonly __brand: "Money" };
export type Qty = string & { readonly __brand: "Qty" };
export type Rate = string & { readonly __brand: "Rate" };

const RATE_SCALE = 6;

/** NUMERIC(18,4) as a string — e.g. "1250.0000". */
export const moneyString = z
  .string()
  .refine((v) => isValidScaled(v, MONEY_SCALE), {
    message: `Must be a decimal string with at most ${MONEY_SCALE} fractional digits`,
  })
  .transform((v) => v as Money);

/** NUMERIC(18,6) as a string — e.g. "12.500000". */
export const qtyString = z
  .string()
  .refine((v) => isValidScaled(v, QTY_SCALE), {
    message: `Must be a decimal string with at most ${QTY_SCALE} fractional digits`,
  })
  .transform((v) => v as Qty);

/** NUMERIC(9,6) as a string — a rate/percentage, e.g. "0.070000" for 7%. */
export const rateString = z
  .string()
  .refine((v) => isValidScaled(v, RATE_SCALE), {
    message: `Must be a decimal string with at most ${RATE_SCALE} fractional digits`,
  })
  .transform((v) => v as Rate);

/**
 * Assert that a string is Money (already validated/formatted, e.g. from the
 * decimal helpers in @erp/utils). Use at the boundary where you produce a value.
 */
export function asMoney(value: string): Money {
  return value as Money;
}

/** Assert that a string is a Qty. */
export function asQty(value: string): Qty {
  return value as Qty;
}

/** Assert that a string is a Rate. */
export function asRate(value: string): Rate {
  return value as Rate;
}
