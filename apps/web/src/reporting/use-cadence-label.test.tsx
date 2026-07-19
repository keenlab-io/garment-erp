import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n/i18n.js";
import { useCadenceLabel, useWeekdayLabel } from "./use-cadence-label.js";

const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => {
  void i18n.changeLanguage("en");
});

describe("useWeekdayLabel", () => {
  it("maps 0-6 to the translated Sunday-Saturday", () => {
    const { result } = renderHook(() => useWeekdayLabel(), { wrapper });
    expect(result.current(0)).toBe("Sunday");
    expect(result.current(1)).toBe("Monday");
    expect(result.current(6)).toBe("Saturday");
  });

  it("translates in Thai", async () => {
    await i18n.changeLanguage("th");
    const { result } = renderHook(() => useWeekdayLabel(), { wrapper });
    expect(result.current(1)).toBe("วันจันทร์");
  });
});

describe("useCadenceLabel", () => {
  it("describes a daily cadence", () => {
    const { result } = renderHook(() => useCadenceLabel(), { wrapper });
    expect(result.current({ frequency: "daily", time: "08:00" })).toBe("Every day 08:00");
  });

  it("describes a weekly cadence with the translated weekday", () => {
    const { result } = renderHook(() => useCadenceLabel(), { wrapper });
    expect(result.current({ frequency: "weekly", dayOfWeek: 1, time: "08:00" })).toBe("Every Monday 08:00");
  });
});
