import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RadioGroup, Radio } from "./radio-group";

describe("RadioGroup", () => {
  it("selects a single option at a time", async () => {
    render(
      <RadioGroup aria-label="VAT mode">
        <Radio value="vat" aria-label="VAT" />
        <Radio value="non-vat" aria-label="Non-VAT" />
      </RadioGroup>,
    );
    const vat = screen.getByRole("radio", { name: "VAT" });
    const nonVat = screen.getByRole("radio", { name: "Non-VAT" });
    await userEvent.click(vat);
    expect(vat).toHaveAttribute("data-state", "checked");
    await userEvent.click(nonVat);
    expect(nonVat).toHaveAttribute("data-state", "checked");
    expect(vat).toHaveAttribute("data-state", "unchecked");
  });
});
