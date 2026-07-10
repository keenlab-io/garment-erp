/*
 * Self-hosted font faces for the locked type system, imported once via `@erp/ui/fonts`.
 * Weights track the token type scale (`@erp/design-tokens` scale.ts): display/headings 500–700,
 * body/UI 400–700, mono 400–500. Bai Jamjuree is the display face (used with restraint),
 * IBM Plex Sans Thai the body/UI/numeric face (Latin + Thai), IBM Plex Mono for tabular data.
 * Self-hosting keeps both scripts rendering identically offline and on the shop floor.
 */

// Bai Jamjuree — display
import "@fontsource/bai-jamjuree/400.css";
import "@fontsource/bai-jamjuree/500.css";
import "@fontsource/bai-jamjuree/600.css";
import "@fontsource/bai-jamjuree/700.css";

// IBM Plex Sans Thai — body / UI / numeric (Latin + Thai)
import "@fontsource/ibm-plex-sans-thai/400.css";
import "@fontsource/ibm-plex-sans-thai/500.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";

// IBM Plex Mono — monospace / tabular data
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
