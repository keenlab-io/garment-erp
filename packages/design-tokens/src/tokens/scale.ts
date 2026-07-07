import type { TokenGroup } from "./types.js";

// Theme-invariant scalars: typography, radius, elevation, spacing, motion, z-index,
// breakpoints (PartA_Direction_Tokens_LOCKED §4/§5.4, UX_UI_SPEC A5.4/A5.5/A5.7).
// The locked doc supersedes A5.5: radius 3/6/10 (not 4/8/12) and ink-tinted shadows
// rgba(20,17,13) (not navy). Emitted on :root; identical in both themes.
export const scale: TokenGroup = {
  // Families — self-hosted; Thai+Latin coverage mandatory (§4)
  font: {
    display: { value: '"Bai Jamjuree", "IBM Plex Sans Thai", sans-serif' }, // restraint-only
    sans: { value: '"IBM Plex Sans Thai", "Noto Sans Thai", "Sarabun", system-ui, sans-serif' },
    mono: { value: '"IBM Plex Mono", "Sarabun", ui-monospace, monospace' },
    numeric: { value: "{font.sans}" }, // + font-variant-numeric: tabular-nums at the component
  },

  // Type scale (rem; 16px base) — display→caption (A5.4). Display sizes route to --font-display.
  text: {
    display: { size: { value: "1.75rem" }, weight: { value: "700" } },
    h1: { size: { value: "1.375rem" }, weight: { value: "700" } },
    h2: { size: { value: "1.125rem" }, weight: { value: "600" } },
    h3: { size: { value: "1rem" }, weight: { value: "600" } },
    body: { size: { value: "0.875rem" }, weight: { value: "400" } },
    "body-strong": { size: { value: "0.875rem" }, weight: { value: "600" } },
    sm: { size: { value: "0.8125rem" }, weight: { value: "400" } },
    caption: { size: { value: "0.75rem" }, weight: { value: "500" } },
    mono: { size: { value: "0.8125rem" }, weight: { value: "450" } },
  },

  // Line-height — Thai needs more room; never below 1.5 or marks collide (A5.4)
  leading: {
    tight: { value: "1.35" }, // numbers, table cells
    normal: { value: "1.6" }, // Thai body
    relaxed: { value: "1.75" }, // long-form Thai paragraphs
  },

  // Radius — tightened, engineered (§5.4)
  radius: {
    none: { value: "0" },
    sm: { value: "3px" }, // chips
    md: { value: "6px" }, // controls
    lg: { value: "10px" }, // cards
    full: { value: "9999px" }, // pills / badges
  },

  // Elevation — ink-tinted, low-spread (§5.4)
  elevation: {
    sm: { value: "0 1px 2px rgba(20,17,13,.06)" },
    md: { value: "0 2px 8px rgba(20,17,13,.08)" },
    lg: { value: "0 8px 24px rgba(20,17,13,.12)" },
    none: { value: "none" },
  },

  // Spacing — 4px base unit (A5.5)
  space: {
    "0": { value: "0" },
    "1": { value: "4px" },
    "2": { value: "8px" },
    "3": { value: "12px" },
    "4": { value: "16px" },
    "5": { value: "20px" },
    "6": { value: "24px" },
    "8": { value: "32px" },
    "10": { value: "40px" },
    "12": { value: "48px" },
    "16": { value: "64px" },
  },

  // Motion — collapsed to 0 under prefers-reduced-motion (see build) (§5.4)
  motion: {
    fast: { value: "150ms" },
    base: { value: "200ms" },
    slow: { value: "300ms" },
  },
  ease: {
    standard: { value: "cubic-bezier(.2,0,0,1)" },
    emphasized: { value: "cubic-bezier(.2,0,0,1)" },
  },

  // z-index scale (A5.7)
  z: {
    base: { value: "0" },
    sticky: { value: "100" },
    drawer: { value: "200" },
    overlay: { value: "300" },
    modal: { value: "400" },
    toast: { value: "500" },
    command: { value: "600" },
  },

  // Breakpoints (mobile-first) (A5.7)
  bp: {
    sm: { value: "360px" },
    md: { value: "768px" },
    lg: { value: "1024px" },
    xl: { value: "1440px" },
  },
};
