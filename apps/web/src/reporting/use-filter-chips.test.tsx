import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/i18n.js";
import { useFilterChips } from "./use-filter-chips.js";

const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  window.localStorage.clear();
  void i18n.changeLanguage("en");
});

describe("useFilterChips", () => {
  it("returns no chips when the filter is unset", () => {
    const { result } = renderHook(() => useFilterChips(undefined, undefined), { wrapper });
    expect(result.current).toEqual([]);
  });

  it("formats a month dimension as a locale period label", () => {
    const { result } = renderHook(() => useFilterChips("month", "2026-01"), { wrapper });
    expect(result.current).toEqual([{ key: "month", label: "Month: January 2026" }]);
  });

  it("formats a day dimension as a locale period label", () => {
    const { result } = renderHook(() => useFilterChips("day", "2026-01-01"), { wrapper });
    expect(result.current[0]?.label).toBe("Day: Jan 1, 2026");
  });

  it("appends the Buddhist-Era year in the Thai locale", async () => {
    await i18n.changeLanguage("th");
    const { result } = renderHook(() => useFilterChips("month", "2026-01"), { wrapper });
    expect(result.current[0]?.label).toContain("(BE 2569)");
  });

  it("passes through a non-period dimension's raw value", () => {
    const { result } = renderHook(() => useFilterChips("customer_id", "c1"), { wrapper });
    expect(result.current).toEqual([{ key: "customer_id", label: "customer_id: c1" }]);
  });
});
