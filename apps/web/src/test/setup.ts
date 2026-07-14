// Extends Vitest's `expect` with the jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom lacks `matchMedia` — the theme (prefers-color-scheme), density (pointer: coarse), and
// responsive (bp-md) code all read it. Provide a non-matching stub tests can override per case.
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// Radix primitives (used by @erp/ui overlays) rely on a few DOM APIs jsdom omits.
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
