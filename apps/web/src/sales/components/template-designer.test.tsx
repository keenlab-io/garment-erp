import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateDesigner, emptyNamedRangeMapping, type NamedRangeMapping, type TemplateAssetSlot } from "./template-designer";

const EMPTY_ASSETS: Record<TemplateAssetSlot, string | null> = { logo: null, signature: null, stamp: null };

describe("emptyNamedRangeMapping", () => {
  it("starts blank with a generated id", () => {
    const mapping = emptyNamedRangeMapping();
    expect(mapping.rangeName).toBe("");
    expect(mapping.field).toBe("");
    expect(mapping.id).toBeTruthy();
  });
});

describe("TemplateDesigner", () => {
  it("shows 'Not set' for an unconfigured asset slot", () => {
    render(<TemplateDesigner assets={EMPTY_ASSETS} onAssetChange={() => {}} mappings={[]} onMappingsChange={() => {}} />);
    expect(screen.getAllByText("Not set")).toHaveLength(3);
  });

  it("renders a preview image once a slot is configured", () => {
    render(
      <TemplateDesigner
        assets={{ ...EMPTY_ASSETS, logo: "data:image/png;base64,abc" }}
        onAssetChange={() => {}}
        mappings={[]}
        onMappingsChange={() => {}}
      />,
    );
    expect(screen.getByAltText("Logo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("clears an asset slot", () => {
    const onAssetChange = vi.fn();
    render(
      <TemplateDesigner
        assets={{ ...EMPTY_ASSETS, logo: "data:image/png;base64,abc" }}
        onAssetChange={onAssetChange}
        mappings={[]}
        onMappingsChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onAssetChange).toHaveBeenCalledWith("logo", null);
  });

  it("edits a named-range mapping's range and field", () => {
    const mapping: NamedRangeMapping = { id: "m1", rangeName: "", field: "" };
    const onMappingsChange = vi.fn();
    render(
      <TemplateDesigner assets={EMPTY_ASSETS} onAssetChange={() => {}} mappings={[mapping]} onMappingsChange={onMappingsChange} />,
    );
    fireEvent.change(screen.getByLabelText("Named range"), { target: { value: "grand_total" } });
    expect(onMappingsChange).toHaveBeenCalledWith([{ ...mapping, rangeName: "grand_total" }]);
  });

  it("adds and removes a mapping row", () => {
    const onMappingsChange = vi.fn();
    render(<TemplateDesigner assets={EMPTY_ASSETS} onAssetChange={() => {}} mappings={[]} onMappingsChange={onMappingsChange} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add mapping" }));
    expect(onMappingsChange).toHaveBeenCalledWith([expect.objectContaining({ rangeName: "", field: "" })]);
  });
});
