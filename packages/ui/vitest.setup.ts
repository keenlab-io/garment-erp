// Extends Vitest's `expect` with the jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { commonEn } from "./src/i18n/resources/common.js";
import { tableEn } from "./src/i18n/resources/table.js";

// Component tests never boot an app — they exercise @erp/ui in isolation the way apps/web's own
// i18next instance would, so `useTranslation()` calls inside components resolve real English
// strings instead of raw keys (mirrors the Storybook preview's own throwaway instance).
void i18next.use(initReactI18next).init({
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "table"],
  resources: { en: { common: commonEn, table: tableEn } },
  interpolation: { escapeValue: false },
});

// jsdom lacks a handful of DOM APIs that Radix primitives (Popper, Avatar, Select, Dialog) rely on.
// Polyfill them so component behavior can be exercised under jsdom.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
