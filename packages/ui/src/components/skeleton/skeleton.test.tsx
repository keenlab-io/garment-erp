import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a shimmer placeholder for the line variant", () => {
    const { container } = render(<Skeleton variant="line" />);
    expect(container.querySelector(".erp-skeleton")).toBeInTheDocument();
  });

  it("renders one cell per column for the table-row variant", () => {
    const { container } = render(<Skeleton variant="table-row" columns={5} />);
    expect(container.querySelectorAll(".erp-skeleton")).toHaveLength(5);
  });

  it("is hidden from assistive tech", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
