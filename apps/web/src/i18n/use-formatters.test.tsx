import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { LocaleProvider, useLocale } from "./locale-context";
import { useDateFormat, useNumberFormat, useMoneyFormat, useQtyFormat } from "./use-formatters";

const wrapper = ({ children }: { children: ReactNode }) => (
  <LocaleProvider>{children}</LocaleProvider>
);

afterEach(() => {
  window.localStorage.clear();
});

describe("useDateFormat", () => {
  it("formats in the Gregorian calendar even in Thai locale (never Buddhist Era)", () => {
    const { result } = renderHook(() => useDateFormat({ dateStyle: "long" }), { wrapper });
    const formatted = result.current.format(new Date(Date.UTC(2026, 0, 15)));
    expect(formatted).toContain("2026");
    expect(formatted).not.toContain("2569"); // BE would read 2026 + 543
  });

  it("re-resolves when the locale toggles", () => {
    const { result } = renderHook(
      () => {
        const { toggleLocale } = useLocale();
        const format = useDateFormat({ dateStyle: "long" });
        return { toggleLocale, format };
      },
      { wrapper },
    );
    const th = result.current.format.format(new Date(Date.UTC(2026, 0, 15)));
    act(() => result.current.toggleLocale());
    const en = result.current.format.format(new Date(Date.UTC(2026, 0, 15)));
    expect(th).not.toBe(en);
    expect(en).toContain("January");
  });
});

describe("useNumberFormat", () => {
  it("renders Arabic digits in both locales", () => {
    const { result } = renderHook(() => useNumberFormat(), { wrapper });
    expect(result.current.format(1234.5)).toBe("1,234.5");
  });
});

describe("useMoneyFormat", () => {
  it("formats a decimal string with THB grouping and no float conversion", () => {
    const { result } = renderHook(() => useMoneyFormat(), { wrapper });
    expect(result.current("53500.00")).toBe("฿53,500.00");
    expect(result.current("-2000")).toBe("฿-2,000.00");
  });

  it("never truncates a large money string into float precision loss", () => {
    const { result } = renderHook(() => useMoneyFormat(), { wrapper });
    // Beyond Number.MAX_SAFE_INTEGER — would lose precision if it ever round-tripped through a float.
    expect(result.current("90071992547409991234.50")).toBe("฿90,071,992,547,409,991,234.50");
  });
});

describe("useQtyFormat", () => {
  it("formats a quantity string with an optional unit suffix", () => {
    const { result } = renderHook(() => useQtyFormat(), { wrapper });
    expect(result.current("1200")).toBe("1,200.00");
    expect(result.current("1200", "pcs")).toBe("1,200.00 pcs");
  });
});
