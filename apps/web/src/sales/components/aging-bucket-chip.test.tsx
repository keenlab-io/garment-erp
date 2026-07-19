import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgingBucketChip, resolveAgingBucket } from "./aging-bucket-chip";

describe("resolveAgingBucket", () => {
  it("buckets not-yet-due and exactly-on-due as current", () => {
    expect(resolveAgingBucket(-10)).toBe("current");
    expect(resolveAgingBucket(0)).toBe("current");
  });

  it("buckets at the boundaries", () => {
    expect(resolveAgingBucket(1)).toBe("d1_30");
    expect(resolveAgingBucket(30)).toBe("d1_30");
    expect(resolveAgingBucket(31)).toBe("d31_60");
    expect(resolveAgingBucket(60)).toBe("d31_60");
    expect(resolveAgingBucket(61)).toBe("d61_90");
    expect(resolveAgingBucket(90)).toBe("d61_90");
    expect(resolveAgingBucket(91)).toBe("over_90");
  });
});

describe("AgingBucketChip", () => {
  it("renders the current bucket for a not-yet-due document", () => {
    render(<AgingBucketChip daysOverdue={-5} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("renders the 90+ bucket as the danger chip", () => {
    render(<AgingBucketChip daysOverdue={120} />);
    expect(screen.getByText("90+ days")).toBeInTheDocument();
  });
});
