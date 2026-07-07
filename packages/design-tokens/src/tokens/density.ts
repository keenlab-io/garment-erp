import type { TokenGroup } from "./types.js";

// Three-density token sets (the interaction signature — PartA §5.4 / UX_UI_SPEC A5.6).
// The build strips the mode segment and scopes each set to a `[data-density="…"]` selector,
// so components read `--density-row-h` etc. and never know which mode is active. Comfortable
// doubles as the :root default (see build). Values are locked: 40/32/64 row heights, …
export const density: TokenGroup = {
  density: {
    comfortable: {
      "row-h": { value: "40px" },
      "control-h": { value: "36px" },
      font: { value: "14px" },
      "pad-x": { value: "16px" },
      "tap-min": { value: "36px" },
      icon: { value: "18px" },
    },
    compact: {
      "row-h": { value: "32px" },
      "control-h": { value: "30px" },
      font: { value: "13px" },
      "pad-x": { value: "12px" },
      "tap-min": { value: "32px" },
      icon: { value: "16px" },
    },
    touch: {
      "row-h": { value: "64px" },
      "control-h": { value: "56px" },
      font: { value: "18px" },
      "pad-x": { value: "20px" },
      "tap-min": { value: "56px" },
      icon: { value: "28px" },
    },
  },
};
