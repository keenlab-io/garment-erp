import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { Button } from "./button";
import { Icon } from "../icon/icon";

describe("Button", () => {
  it("renders a native button with its label", () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("fires onClick when interactive", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Approve</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is non-interactive and announces busy while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Saving/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("labels an icon-only button via aria-label", () => {
    render(
      <Button variant="icon" aria-label="Add line">
        <Icon icon={Plus} />
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Add line" })).toBeInTheDocument();
  });

  it("renders as a child element with asChild", () => {
    render(
      <Button asChild variant="secondary">
        <a href="#target">Open</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "#target");
  });
});
