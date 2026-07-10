import { render, screen } from "@testing-library/react";
import { INK_CHIPS } from "@erp/design-tokens";
import { TokenMatrix } from "./TokenMatrix";

// Smoke test proving the test harness + token-metadata wiring: every Ink-Chip renders its
// text label (the "never color alone" contract), sourced from @erp/design-tokens.
describe("TokenMatrix", () => {
  it("renders every Ink-Chip status label from the contract token set", () => {
    render(<TokenMatrix />);
    for (const meta of Object.values(INK_CHIPS)) {
      expect(screen.getByText(meta.label)).toBeInTheDocument();
    }
  });
});
