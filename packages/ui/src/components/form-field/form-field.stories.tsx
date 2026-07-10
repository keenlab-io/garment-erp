import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormField } from "./form-field";
import { Input } from "../input/input";

const meta = {
  title: "Primitives/FormField",
  component: FormField,
  args: { label: "Field", children: <Input /> },
  parameters: { layout: "padded" },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-5">
      <FormField label="Customer" required help="Legal entity on the invoice.">
        <Input placeholder="Acme Textiles" />
      </FormField>
      <FormField label="Tax ID" error="Tax ID must be 13 digits.">
        <Input defaultValue="123" />
      </FormField>
    </div>
  ),
};
