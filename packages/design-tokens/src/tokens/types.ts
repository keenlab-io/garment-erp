// Minimal Style Dictionary source shape used throughout the token modules.
// A leaf carries a `value` (a hex, a dimension string, or a `{group.token}` reference);
// a group nests further leaves/groups. Paths become CSS variable names in the build.

export interface TokenLeaf {
  value: string;
}

export interface TokenGroup {
  [key: string]: TokenLeaf | TokenGroup;
}
