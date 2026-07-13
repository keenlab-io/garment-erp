import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip, TooltipProvider } from "./tooltip";

describe("Tooltip", () => {
  it("reveals its content on hover", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Requires sales.document.void">
          <button type="button">Void</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.hover(screen.getByRole("button", { name: "Void" }));
    // Radix renders the visible tooltip plus an a11y mirror; assert at least one is present.
    expect(await screen.findAllByText("Requires sales.document.void")).not.toHaveLength(0);
  });
});
