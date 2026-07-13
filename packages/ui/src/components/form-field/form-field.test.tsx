import { render, screen } from "@testing-library/react";
import { FormField } from "./form-field";
import { Input } from "../input/input";

describe("FormField", () => {
  it("associates the label with the control", () => {
    render(
      <FormField label="Customer">
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText("Customer")).toBeInTheDocument();
  });

  it("references help text via aria-describedby", () => {
    render(
      <FormField label="Tax ID" help="13 digits">
        <Input />
      </FormField>,
    );
    const control = screen.getByLabelText("Tax ID");
    const help = screen.getByText("13 digits");
    expect(control.getAttribute("aria-describedby")).toContain(help.id);
  });

  it("marks the control invalid and references the error when an error is shown", () => {
    render(
      <FormField label="Tax ID" error="Must be 13 digits">
        <Input />
      </FormField>,
    );
    const control = screen.getByLabelText("Tax ID");
    const error = screen.getByText("Must be 13 digits");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control.getAttribute("aria-describedby")).toContain(error.id);
    expect(error).toHaveClass("text-danger");
  });

  it("marks required fields with aria-required", () => {
    render(
      <FormField label="Customer" required>
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText(/Customer/)).toHaveAttribute("aria-required", "true");
  });
});
