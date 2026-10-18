import { asMoney, type Money } from "@erp/contracts";

const MONEY_INPUT = /^\d+(\.\d{1,4})?$/;

/** Parse an admin-typed amount into the wire `Money` string, or `null` when it isn't a plain non-negative decimal. */
export function parseMoneyInput(raw: string): Money | null {
  const trimmed = raw.trim();
  return MONEY_INPUT.test(trimmed) ? asMoney(trimmed) : null;
}

/** An optional amount field: blank → `undefined` (omit), invalid → `null`. */
export function parseOptionalMoney(raw: string): Money | undefined | null {
  return raw.trim() === "" ? undefined : parseMoneyInput(raw);
}
