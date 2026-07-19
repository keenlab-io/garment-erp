import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
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
  {
    id: "c2",
    name: "Northern Textiles Ltd.",
    tax_id: null,
    branch_code: null,
    addresses: [],
    credit_terms_days: 0,
    version: 0,
  },
];

const meta = {
  title: "Sales/CustomerAutocomplete",
  component: CustomerAutocomplete,
  args: { customers: CUSTOMERS, value: "", onSelect: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof CustomerAutocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness() {
  const [value, setValue] = React.useState("");
  return (
    <CustomerAutocomplete customers={CUSTOMERS} value={value} onSelect={(c) => setValue(c?.id ?? "")} />
  );
}

export const Default: Story = {
  render: () => <Harness />,
};

export const SelectedFillsTaxFields: Story = {
  args: { customers: CUSTOMERS, value: "c1", onSelect: () => {} },
};

export const SelectedWithNoTaxFieldsOnFile: Story = {
  args: { customers: CUSTOMERS, value: "c2", onSelect: () => {} },
};
