import { describe, expect, it } from "vitest";
import { renderSequenceFormat } from "./sequence.service.js";

describe("renderSequenceFormat", () => {
  const base = { prefix: "INV", year: 2026, seq: 42, padding: 4 };

  it("substitutes {prefix} and {yyyy}", () => {
    expect(renderSequenceFormat("{prefix}-{yyyy}", base)).toBe("INV-2026");
  });

  it("zero-pads {seq:0000} to the width of the token", () => {
    expect(renderSequenceFormat("{seq:0000}", base)).toBe("0042");
    expect(renderSequenceFormat("{seq:000000}", base)).toBe("000042");
  });

  it("pads bare {seq} to the row's default padding", () => {
    expect(renderSequenceFormat("{seq}", { ...base, padding: 6 })).toBe("000042");
  });

  it("renders a full template with all tokens", () => {
    expect(renderSequenceFormat("{prefix}-{yyyy}-{seq:0000}", base)).toBe(
      "INV-2026-0042",
    );
  });

  it("does not truncate a sequence wider than its padding", () => {
    expect(renderSequenceFormat("{seq:0000}", { ...base, seq: 123456 })).toBe(
      "123456",
    );
  });
});
