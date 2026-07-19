import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Customer } from "@erp/contracts";
import { CustomerAutocomplete } from "./customer-autocomplete";

const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    name: "Siam Garments Co.",
    tax_id: "0105561000001",
    branch_code: "00000",
    addresses: [
      {
        line1: "99 Sukhumvit Rd",
        subdistrict: "Khlong Toei",
        district: "Khlong Toei",
        province: "Bangkok",
        postal_code: "10110",
        is_default: true,
      },
    ],
    credit_terms_days: 30,
    version: 0,
  },
];

describe("CustomerAutocomplete", () => {
  it("selecting a customer fills their tax fields", () => {
    render(<CustomerAutocomplete customers={CUSTOMERS} value="c1" onSelect={() => {}} />);
    expect(screen.getByText("0105561000001")).toBeInTheDocument();
    expect(screen.getByText("00000")).toBeInTheDocument();
    expect(screen.getByText(/99 Sukhumvit Rd/)).toBeInTheDocument();
  });

  it("shows nothing filled until a customer is selected", () => {
    render(<CustomerAutocomplete customers={CUSTOMERS} value="" onSelect={() => {}} />);
    expect(screen.queryByText("0105561000001")).not.toBeInTheDocument();
  });

  it("calls onSelect with the picked customer via the combobox", () => {
    const onSelect = vi.fn();
    render(<CustomerAutocomplete customers={CUSTOMERS} value="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Siam Garments Co. · 0105561000001"));
    expect(onSelect).toHaveBeenCalledWith(CUSTOMERS[0]);
  });
});
