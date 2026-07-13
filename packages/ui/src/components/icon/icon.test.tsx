import { render, screen } from "@testing-library/react";
import { Search } from "lucide-react";
import { Icon } from "./icon";

describe("Icon", () => {
  it("is decorative (hidden) by default", () => {
    const { container } = render(<Icon icon={Search} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes a labelled icon to assistive tech", () => {
    render(<Icon icon={Search} label="Search" />);
    const svg = screen.getByRole("img", { name: "Search" });
    expect(svg).toBeInTheDocument();
  });

  it("applies the density icon token when no explicit size is given", () => {
    const { container } = render(<Icon icon={Search} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveStyle({ width: "var(--density-icon)" });
  });

  it("honours an explicit pixel size", () => {
    const { container } = render(<Icon icon={Search} size={40} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveStyle({ width: "40px" });
  });
});
