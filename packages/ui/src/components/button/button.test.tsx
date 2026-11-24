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

  // Browser page translation (Chrome/Google Translate) swaps a text node for a <font> wrapper
  // behind React's back. The loading spinner used to be inserted *before* the bare label text
  // node, so on submit React's insertBefore referenced a node no longer in the button and threw
  // "Failed to execute 'insertBefore' on 'Node'" — the platform login crash.
  it("survives page translation replacing its label text when it starts loading", () => {
    const { rerender } = render(<Button>Sign in</Button>);
    const button = screen.getByRole("button");
    const textNode = [...button.querySelectorAll("*"), button]
      .flatMap((el) => [...el.childNodes])
      .find((n) => n.nodeType === Node.TEXT_NODE && n.textContent === "Sign in")!;
    const font = document.createElement("font");
    font.textContent = "เข้าสู่ระบบ";
    textNode.parentNode!.replaceChild(font, textNode);

    expect(() => rerender(<Button loading>Sign in</Button>)).not.toThrow();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
