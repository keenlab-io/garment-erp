import { describe, it, expect } from "vitest";
import { commonEn, commonTh, tableEn, tableTh } from "@erp/ui";
import { shellEn, iamEn, hrEn, inventoryEn, productionEn, salesEn, reportingEn } from "./resources/en";
import { shellTh, iamTh, hrTh, inventoryTh, productionTh, salesTh, reportingTh } from "./resources/th";

// Runs as a normal `pnpm test` file, so it's part of the existing CI `test` task without a
// separate job (M0 §7.3) — no `tooling/` script needed. `shellTh`/`commonTh`/`tableTh` already
// enforce key-shape parity at *typecheck* time via a mapped type against their `*En` counterpart
// (a missing/extra key is a compile error); this test is the runtime backstop — it also catches
// mismatched interpolation placeholders, which the type system can't see (both sides just widen
// to `string`).

type MessageTree = { [key: string]: string | MessageTree };

/** Every leaf key, dot-joined (e.g. `"nav.dashboard"`). */
function leafKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leafKeys(value, path);
  });
}

/** `{{token}}` interpolation placeholders referenced in a string, sorted for order-independent diffing. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!).sort();
}

function leafValue(tree: MessageTree, path: string): string {
  const value = path.split(".").reduce<MessageTree | string>((node, key) => {
    if (typeof node === "string") throw new Error(`not a tree at ${path}`);
    return node[key]!;
  }, tree);
  if (typeof value !== "string") throw new Error(`not a leaf at ${path}`);
  return value;
}

const NAMESPACES: Record<string, { en: MessageTree; th: MessageTree }> = {
  shell: { en: shellEn, th: shellTh },
  common: { en: commonEn, th: commonTh },
  table: { en: tableEn, th: tableTh },
  iam: { en: iamEn, th: iamTh },
  hr: { en: hrEn, th: hrTh },
  inventory: { en: inventoryEn, th: inventoryTh },
  production: { en: productionEn, th: productionTh },
  sales: { en: salesEn, th: salesTh },
  reporting: { en: reportingEn, th: reportingTh },
};

describe.each(Object.entries(NAMESPACES))("i18n completeness — %s namespace", (_name, { en, th }) => {
  const enKeys = leafKeys(en).sort();
  const thKeys = leafKeys(th).sort();

  it("has the exact same key set in th and en", () => {
    const missingFromTh = enKeys.filter((k) => !thKeys.includes(k));
    const missingFromEn = thKeys.filter((k) => !enKeys.includes(k));
    expect(missingFromTh, `keys missing from th: ${missingFromTh.join(", ")}`).toHaveLength(0);
    expect(missingFromEn, `keys missing from en: ${missingFromEn.join(", ")}`).toHaveLength(0);
  });

  it("never leaves a translation blank", () => {
    for (const key of enKeys) {
      expect(leafValue(en, key).trim(), `en.${key} is blank`).not.toBe("");
      expect(leafValue(th, key).trim(), `th.${key} is blank`).not.toBe("");
    }
  });

  it("keeps interpolation placeholders identical across locales", () => {
    for (const key of enKeys) {
      expect(placeholders(leafValue(th, key)), `th.${key} placeholders`).toEqual(
        placeholders(leafValue(en, key)),
      );
    }
  });
});
