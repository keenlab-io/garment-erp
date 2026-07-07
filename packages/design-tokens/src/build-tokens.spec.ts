import { describe, expect, it, beforeAll } from "vitest";
import { renderAll } from "./build-tokens.js";
import { INK_CHIPS } from "./chips.js";

// Guards the hand-transcription of docs/PartA_Direction_Tokens_LOCKED.md against drift.
// Renders the artifacts in-memory (no dist/ dependency) and pins the locked values.

let css = "";
let tailwindCss = "";

beforeAll(async () => {
  const out = await renderAll();
  css = out.css;
  tailwindCss = out.tailwindCss;
});

/** Extract the body of a single selector block (up to its closing brace). */
function block(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

describe("locked primitives", () => {
  it("emits the Ink & Substrate scale on :root", () => {
    const root = block(css, ":root {");
    expect(root).toContain("--substrate-50: #FAF8F4;"); // app canvas
    expect(root).toContain("--ink-900: #14110D;"); // chrome
    expect(root).toContain("--cyan-700: #0A6E83;"); // press-cyan accent
    expect(root).toContain("--magenta-500: #C61A78;"); // signature spot
    expect(root).toContain("--rubine-500: #C23341;"); // danger
  });
});

describe("locked light semantics", () => {
  it("resolves the key roles to their locked primitives", () => {
    const root = block(css, ":root {");
    expect(root).toContain("--color-bg-app: var(--substrate-50);");
    expect(root).toContain("--color-accent: var(--cyan-700);");
    expect(root).toContain("--color-brand: var(--ink-900);");
    expect(root).toContain("--color-danger: var(--rubine-500);");
    expect(root).toContain("--color-spot: var(--magenta-500);");
  });
});

describe("locked radius", () => {
  it("uses the tightened engineered values", () => {
    const root = block(css, ":root {");
    expect(root).toContain("--radius-md: 6px;"); // controls
    expect(root).toContain("--radius-sm: 3px;"); // chips
    expect(root).toContain("--radius-lg: 10px;");
  });
});

describe("three density sets", () => {
  it("emits locked row heights per data-density", () => {
    expect(block(css, '[data-density="comfortable"]')).toContain("--density-row-h: 40px;");
    expect(block(css, '[data-density="compact"]')).toContain("--density-row-h: 32px;");
    expect(block(css, '[data-density="touch"]')).toContain("--density-row-h: 64px;");
  });

  it("applies comfortable as the attribute-less default too", () => {
    // comfortable shares its block with :root
    expect(css).toContain(':root,\n[data-density="comfortable"] {');
  });
});

describe("paper stays white in both themes", () => {
  it("light and dark both point --color-bg-paper at substrate-0 (#FFFFFF)", () => {
    expect(block(css, ":root {")).toContain("--color-bg-paper: var(--substrate-0);");
    expect(block(css, '[data-theme="dark"]')).toContain("--color-bg-paper: var(--substrate-0);");
  });
});

describe("dark theme is a semantic remap", () => {
  it("lifts the accent and desaturates danger", () => {
    const darkBlock = block(css, '[data-theme="dark"]');
    expect(darkBlock).toContain("--color-accent: var(--cyan-500);"); // lifted
    expect(darkBlock).toContain("--color-danger: #E0697A;"); // locked dark literal
  });
});

describe("Ink-Chip token group", () => {
  const chips = ["pending", "in-progress", "completed", "delayed", "hold", "outsourced"] as const;

  it("defines all seven chip tokens (six status + active-state) in both themes", () => {
    const root = block(css, ":root {");
    const darkBlock = block(css, '[data-theme="dark"]');
    for (const chip of chips) {
      expect(root).toContain(`--chip-${chip}:`);
      expect(darkBlock).toContain(`--chip-${chip}:`);
    }
    expect(root).toContain("--chip-active-state: var(--magenta-500);");
    expect(darkBlock).toContain("--chip-active-state: var(--magenta-400);");
  });

  it("pairs every status chip token with glyph + label metadata", () => {
    for (const chip of chips) {
      expect(INK_CHIPS[chip].token).toBe(`--chip-${chip}`);
      expect(INK_CHIPS[chip].glyph.length).toBeGreaterThan(0);
      expect(INK_CHIPS[chip].label.length).toBeGreaterThan(0);
    }
  });
});

describe("reduced motion collapses durations", () => {
  it("zeroes the motion tokens under prefers-reduced-motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toContain("--motion-fast: 0ms;");
    expect(reduced).toContain("--motion-base: 0ms;");
    expect(reduced).toContain("--motion-slow: 0ms;");
  });
});

describe("Tailwind v4 preset exposes semantic names only", () => {
  it("maps semantic roles to var() references", () => {
    expect(tailwindCss).toContain("@theme inline");
    expect(tailwindCss).toContain("--color-accent: var(--color-accent);");
    expect(tailwindCss).toContain("--color-danger: var(--color-danger);");
    expect(tailwindCss).toContain("--radius-md: var(--radius-md);");
  });

  it("never leaks a primitive scale name", () => {
    expect(tailwindCss).not.toMatch(/--(ink|cyan|substrate|magenta|rubine|amber|violet|green)-\d/);
  });
});
