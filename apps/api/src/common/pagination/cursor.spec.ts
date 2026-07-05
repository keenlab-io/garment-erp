import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, tryDecodeCursor } from "@erp/utils";
import { buildPage } from "./cursor.js";

describe("cursor codec (@erp/utils)", () => {
  it("round-trips an arbitrary JSON payload", () => {
    const payload = { id: "abc", createdAt: "2026-07-05T00:00:00.000Z", n: 42 };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("throws on a malformed cursor", () => {
    expect(() => decodeCursor("!!!not-base64url-json!!!")).toThrow();
  });

  it("tryDecodeCursor returns null on a malformed cursor", () => {
    expect(tryDecodeCursor("!!!not-base64url-json!!!")).toBeNull();
    expect(tryDecodeCursor(encodeCursor({ ok: true }))).toEqual({ ok: true });
  });
});

describe("buildPage", () => {
  it("returns all rows and a null cursor when there is no extra row", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const page = buildPage(rows, 2, (r) => r.id);
    expect(page.data).toEqual(rows);
    expect(page.next_cursor).toBeNull();
  });

  it("drops the sentinel row and encodes the last kept row when there is more", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const page = buildPage(rows, 2, (r) => r.id);
    expect(page.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(page.next_cursor).not.toBeNull();
    expect(decodeCursor(page.next_cursor as string)).toBe(2);
  });

  it("returns an empty page with a null cursor for no rows", () => {
    const page = buildPage([] as { id: number }[], 10, (r) => r.id);
    expect(page.data).toEqual([]);
    expect(page.next_cursor).toBeNull();
  });
});
