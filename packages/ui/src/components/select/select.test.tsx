import { render, screen } from "@testing-library/react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";

// Radix Select's listbox interaction relies on pointer APIs jsdom does not implement, so we assert
// the trigger renders the selected value. Open/keyboard behavior is verified in Storybook.
describe("Select", () => {
  it("renders the current value in the trigger", () => {
    render(
      <Select defaultValue="qv">
        <SelectTrigger aria-label="Document type">
          <SelectValue placeholder="Select type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="qv">QV — valued</SelectItem>
          <SelectItem value="qnv">QNV — non-valued</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Document type" })).toHaveTextContent("QV — valued");
  });
});
