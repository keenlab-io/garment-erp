// Extends Vitest's `expect` with the jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";

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
