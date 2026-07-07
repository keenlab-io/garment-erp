import { primitives } from "./primitives.js";
import { light, dark } from "./semantic.js";
import { scale } from "./scale.js";
import { density } from "./density.js";
import type { TokenGroup } from "./types.js";

// The single Style Dictionary source tree. Top-level groups become CSS variable name
// prefixes; `light`/`dark`/`density` are stripped/rescoped by the build (see build-tokens.ts).
export const tokens: TokenGroup = {
  ...primitives,
  ...scale,
  ...density,
  light,
  dark,
};
