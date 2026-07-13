import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its content", () => {
    render(<Badge tone="success">Paid</Badge>);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("applies the mono code treatment", () => {
    render(<Badge mono>CALCULATED</Badge>);
    expect(screen.getByText("CALCULATED")).toHaveClass("font-mono", "uppercase");
  });
});
