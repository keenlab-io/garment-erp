// Public TS API for @erp/design-tokens. The token *values* ship as CSS (`@erp/design-tokens/css`)
// and a Tailwind preset (`@erp/design-tokens/tailwind.css`); this entry exposes the non-CSS
// metadata consumers need: the Ink-Chip glyph/label set and the theme/density attribute values
// this package's CSS is keyed on.

export * from "./chips.js";

/** Values for the `data-theme` document attribute the token CSS themes on. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Values for the `data-density` document attribute the token CSS scopes density sets to. */
export const DENSITIES = ["comfortable", "compact", "touch"] as const;
export type Density = (typeof DENSITIES)[number];
