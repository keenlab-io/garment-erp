import type { TokenGroup } from "./types.js";

// Primitives — "Ink & Substrate" (PartA_Direction_Tokens_LOCKED §5.1).
// These are the only place raw hex lives; semantics reference them and never leak to
// consumers. Emitted once on :root; both light and dark semantics resolve against them.
export const primitives: TokenGroup = {
  // SUBSTRATE — warm paper surfaces
  substrate: {
    "0": { value: "#FFFFFF" }, // true paper / document
    "50": { value: "#FAF8F4" }, // app canvas (warm off-white)
    "100": { value: "#F2EEE7" }, // sunken / wells
    "200": { value: "#E7E1D7" },
  },

  // INK — warm carbon neutral (text AND chrome)
  ink: {
    "50": { value: "#F4EFE7" },
    "100": { value: "#EAE3D8" },
    "200": { value: "#D8CFC2" },
    "300": { value: "#BBB0A2" },
    "400": { value: "#938678" },
    "500": { value: "#6B5F52" },
    "600": { value: "#4A4036" },
    "700": { value: "#322A21" },
    "800": { value: "#211C16" },
    "900": { value: "#14110D" }, // chrome (sidebar/topbar), near-black warm
  },

  // PRESS CYAN — accent
  cyan: {
    "400": { value: "#3FB4CC" },
    "500": { value: "#109FBD" },
    "600": { value: "#0B859E" },
    "700": { value: "#0A6E83" },
    "800": { value: "#084F5E" },
  },

  // PROCESS MAGENTA — the signature spot (rare, meaningful)
  magenta: {
    "400": { value: "#E0408F" },
    "500": { value: "#C61A78" },
    "600": { value: "#A8155F" },
  },

  // STATUS INKS — conventional hues, ink-tuned
  green: {
    "50": { value: "#E7F2EB" },
    "500": { value: "#2E7D52" },
    "700": { value: "#1C5436" },
  },
  amber: {
    "50": { value: "#FBF1DF" },
    "500": { value: "#B5781B" },
    "700": { value: "#6F4A0F" },
  },
  rubine: {
    "50": { value: "#FBE9EB" },
    "500": { value: "#C23341" },
    "700": { value: "#7E2530" },
  },
  violet: {
    "50": { value: "#EEEAF7" },
    "500": { value: "#6B4FB0" },
    "700": { value: "#43317A" },
  },
};
