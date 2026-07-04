/**
 * Opaque cursor codec for keyset pagination (spec §13).
 *
 * A cursor is an arbitrary JSON payload (the keyset of the last row on a page)
 * encoded as a base64url string so it travels opaquely in query strings. The web
 * bundle tree-shakes this module out, so `Buffer` never reaches the browser.
 */

/** Encode a keyset payload as an opaque base64url cursor string. */
export function encodeCursor(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** Decode a cursor string back into its payload; throws if malformed. */
export function decodeCursor(s: string): unknown {
  return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
}

/** Decode a cursor string, returning `null` instead of throwing on malformed input. */
export function tryDecodeCursor(s: string): unknown | null {
  try {
    return decodeCursor(s);
  } catch {
    return null;
  }
}
