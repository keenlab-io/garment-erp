import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import i18n from "../i18n/i18n.js";
import { LocaleProvider, useLocale } from "../i18n/locale-context.js";
import { useDocumentDateFormat } from "./use-document-date-format.js";

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider>;

afterEach(() => {
  window.localStorage.clear();
  void i18n.changeLanguage("th");
});

describe("useDocumentDateFormat", () => {
  it("appends the Buddhist-Era year in the Thai locale", () => {
    const { result } = renderHook(() => useDocumentDateFormat(), { wrapper });
    const formatted = result.current(new Date(Date.UTC(2026, 6, 19)));
    expect(formatted).toContain("2026");
    expect(formatted).toContain("(BE 2569)");
  });

  it("stays plain Gregorian with no BE suffix in the English locale", () => {
    const { result } = renderHook(
      () => {
        const { toggleLocale } = useLocale();
        const format = useDocumentDateFormat();
        return { toggleLocale, format };
      },
      { wrapper },
    );
    act(() => result.current.toggleLocale());
    const formatted = result.current.format(new Date(Date.UTC(2026, 6, 19)));
    expect(formatted).toContain("2026");
    expect(formatted).not.toContain("BE");
  });

  it("accepts an ISO date string", () => {
    const { result } = renderHook(() => useDocumentDateFormat(), { wrapper });
    expect(result.current("2026-07-19")).toContain("(BE 2569)");
  });
});
