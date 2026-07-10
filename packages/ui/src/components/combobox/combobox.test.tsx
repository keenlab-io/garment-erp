import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox, type ComboboxOption } from "./combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "acme", label: "Acme Textiles" },
  { value: "borey", label: "Borey Garments" },
];

function SingleHarness() {
  const [value, setValue] = React.useState<string>();
  return <Combobox options={OPTIONS} value={value} onValueChange={setValue} placeholder="Pick" />;
}

describe("Combobox", () => {
  it("opens, filters, and selects an option", async () => {
    const user = userEvent.setup();
    render(<SingleHarness />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("textbox"), "bor");
    expect(screen.queryByRole("option", { name: "Acme Textiles" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Borey Garments" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Borey Garments");
  });

  it("shows a no-results message when nothing matches", async () => {
    const user = userEvent.setup();
    render(<SingleHarness />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByRole("textbox"), "zzz");
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows a loading state in async mode", async () => {
    const user = userEvent.setup();
    render(<Combobox options={[]} onSearchChange={() => {}} loading placeholder="Search" />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
