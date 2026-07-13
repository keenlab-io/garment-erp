import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "./switch";

describe("Switch", () => {
  it("toggles on click", async () => {
    render(<Switch aria-label="Notifications" />);
    const toggle = screen.getByRole("switch", { name: "Notifications" });
    expect(toggle).toHaveAttribute("data-state", "unchecked");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-state", "checked");
  });
});
