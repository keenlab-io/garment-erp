import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./input";

describe("Input", () => {
  it("accepts text entry", async () => {
    render(<Input placeholder="Customer" />);
    const input = screen.getByPlaceholderText("Customer");
    await userEvent.type(input, "Acme");
    expect(input).toHaveValue("Acme");
  });

  it("toggles password visibility", async () => {
    render(<Input type="password" placeholder="Password" />);
    const input = screen.getByPlaceholderText("Password");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("right-aligns tabular numerals for number inputs", () => {
    render(<Input type="number" placeholder="Amount" />);
    expect(screen.getByPlaceholderText("Amount")).toHaveClass("tabular-nums", "text-right");
  });

  it("forwards aria-invalid to the input", () => {
    render(<Input aria-invalid placeholder="Bad" />);
    expect(screen.getByPlaceholderText("Bad")).toHaveAttribute("aria-invalid", "true");
  });
});
