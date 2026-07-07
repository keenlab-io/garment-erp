import type { TokenGroup } from "./types.js";

// Semantic layer (PartA_Direction_Tokens_LOCKED §5.2 light / §6 dark).
// Grouped under `light` / `dark`; the build strips that prefix so both resolve to the same
// CSS variable names (`--color-accent`, `--chip-pending`, …). Dark is a token swap only:
// every semantic re-points at a lifted primitive or a locked dark literal — no new names.
// Chips (§5.3/§6) live here because they are theme-varying like the rest of the semantics.

// LIGHT — semantics reference primitives so a primitive edit propagates everywhere.
export const light: TokenGroup = {
  color: {
    // Brand / interactive
    brand: { value: "{ink.900}" },
    accent: { value: "{cyan.700}" },
    "accent-hover": { value: "{cyan.800}" },
    "accent-text": { value: "{cyan.700}" },
    "accent-bright": { value: "{cyan.500}" },
    spot: { value: "{magenta.500}" }, // SIGNATURE — brand mark, active chip, one hero CTA
    "accent-subtle": { value: "{ink.50}" },

    // Surfaces — elevation by lightness + warmth
    bg: {
      app: { value: "{substrate.50}" },
      surface: { value: "{substrate.0}" },
      "surface-raised": { value: "{substrate.0}" }, // pair with --elevation-md
      sunken: { value: "{substrate.100}" },
      paper: { value: "{substrate.0}" }, // document/PDF preview — pure white, always
    },

    // Text
    text: {
      primary: { value: "{ink.800}" },
      secondary: { value: "{ink.600}" },
      muted: { value: "{ink.500}" },
      inverse: { value: "{substrate.50}" },
      link: { value: "{cyan.700}" },
    },

    // Lines
    border: { value: "{ink.200}" },
    "border-strong": { value: "{ink.300}" },
    "border-focus": { value: "{cyan.500}" },

    // Semantic status — solid / subtle-bg / text-on-subtle
    success: { value: "{green.500}" },
    "success-subtle": { value: "{green.50}" },
    "success-on": { value: "{green.700}" },
    warning: { value: "{amber.500}" },
    "warning-subtle": { value: "{amber.50}" },
    "warning-on": { value: "{amber.700}" },
    danger: { value: "{rubine.500}" },
    "danger-subtle": { value: "{rubine.50}" },
    "danger-on": { value: "{rubine.700}" },
    info: { value: "{cyan.600}" },
    "info-subtle": { value: "#E5F2F5" },
    "info-on": { value: "{cyan.700}" },
  },

  // Ink-Chip status set (§5.3) — solid swatch; glyph/label live in ../chips.ts
  chip: {
    pending: { value: "{ink.300}" },
    "in-progress": { value: "{cyan.600}" },
    completed: { value: "{green.500}" },
    delayed: { value: "{rubine.500}" },
    hold: { value: "{amber.500}" },
    outsourced: { value: "{violet.500}" },
    "active-state": { value: "{magenta.500}" }, // the spot — selected / needs-match
  },
};

// DARK — remap the semantic layer only (§6). Lifted accents; elevation by lightness, not
// shadow; desaturated status/chip literals to hold AA on near-black. Paper stays white.
export const dark: TokenGroup = {
  color: {
    brand: { value: "{ink.900}" },
    accent: { value: "{cyan.500}" },
    "accent-hover": { value: "{cyan.400}" },
    "accent-text": { value: "{cyan.400}" },
    "accent-bright": { value: "{cyan.400}" },
    spot: { value: "{magenta.400}" },
    "accent-subtle": { value: "#20303A" }, // cyan-tinted dark selection tint

    bg: {
      app: { value: "{ink.900}" },
      surface: { value: "{ink.800}" },
      "surface-raised": { value: "{ink.700}" },
      sunken: { value: "#0E0C09" },
      paper: { value: "{substrate.0}" }, // LOCKED: documents are white even in dark mode
    },

    text: {
      primary: { value: "{substrate.50}" },
      secondary: { value: "{ink.200}" },
      muted: { value: "{ink.400}" },
      inverse: { value: "{ink.900}" },
      link: { value: "{cyan.400}" },
    },

    border: { value: "{ink.700}" },
    "border-strong": { value: "{ink.600}" },
    "border-focus": { value: "{cyan.400}" },

    success: { value: "#4FA876" },
    "success-subtle": { value: "#16241C" },
    "success-on": { value: "#BFE6CC" },
    warning: { value: "#D69A3C" },
    "warning-subtle": { value: "#2A2110" },
    "warning-on": { value: "#F1DCAE" },
    danger: { value: "#E0697A" },
    "danger-subtle": { value: "#2A1518" },
    "danger-on": { value: "#F6C9CF" },
    info: { value: "#3FB4CC" },
    "info-subtle": { value: "#0E2329" },
    "info-on": { value: "#BCE4ED" },
  },

  chip: {
    pending: { value: "{ink.500}" },
    "in-progress": { value: "{cyan.400}" },
    completed: { value: "#4FA876" },
    delayed: { value: "#E0697A" },
    hold: { value: "#D69A3C" },
    outsourced: { value: "#9277D0" },
    "active-state": { value: "{magenta.400}" },
  },
};
