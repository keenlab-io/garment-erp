import { render, screen } from "@testing-library/react";
import { INK_CHIPS } from "@erp/design-tokens";
import { RoutingStatus } from "@erp/contracts";
import { InkChip } from "./ink-chip";
import { chipMeta, routingStatusToChip } from "./status";

describe("InkChip", () => {
  it("renders the label and glyph so status is never color alone", () => {
    render(<InkChip status="in-progress" />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText(INK_CHIPS["in-progress"].glyph)).toBeInTheDocument();
  });

  it("renders void muted + struck through with no swatch", () => {
    const { container } = render(<InkChip status="void" />);
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveClass("line-through");
    expect(chip).toHaveClass("text-text-muted");
    expect(screen.getByText("Void")).toBeInTheDocument();
  });

  it("accepts a label override", () => {
    render(<InkChip status="completed" label="เสร็จ" />);
    expect(screen.getByText("เสร็จ")).toBeInTheDocument();
  });

  it("maps every RoutingStatus to a chip via routingStatusToChip", () => {
    for (const status of Object.values(RoutingStatus)) {
      const meta = chipMeta(routingStatusToChip(status));
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.swatch).toMatch(/^var\(--chip-/);
    }
  });

  it("resolves document-lifecycle statuses to semantic color roles", () => {
    expect(chipMeta("paid").swatch).toBe("var(--color-success)");
    expect(chipMeta("overdue").swatch).toBe("var(--color-danger)");
    expect(chipMeta("void").swatch).toBeNull();
    expect(chipMeta("sent").swatch).toBe("var(--color-info)");
    expect(chipMeta("converted").swatch).toBe("var(--color-success)");
    expect(chipMeta("expired").swatch).toBe("var(--color-warning)");
    expect(chipMeta("rejected").swatch).toBe("var(--color-danger)");
  });

  it("resolves AR-aging bucket statuses to semantic color roles", () => {
    expect(chipMeta("aging-current").swatch).toBe("var(--color-success)");
    expect(chipMeta("aging-1-30").swatch).toBe("var(--color-info)");
    expect(chipMeta("aging-31-60").swatch).toBe("var(--color-warning)");
    expect(chipMeta("aging-61-90").swatch).toBe("var(--color-danger)");
    expect(chipMeta("aging-90-plus").swatch).toBe("var(--color-danger)");
  });
});
