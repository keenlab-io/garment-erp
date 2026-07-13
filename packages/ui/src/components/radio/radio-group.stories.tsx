import type { Meta, StoryObj } from "@storybook/react-vite";
import { RadioGroup, Radio } from "./radio-group";

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VatMode: Story = {
  render: () => (
    <RadioGroup defaultValue="vat" aria-label="VAT mode">
      {[
        { value: "vat", label: "VAT" },
        { value: "non-vat", label: "Non-VAT" },
      ].map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-body text-text-primary">
          <Radio value={o.value} /> {o.label}
        </label>
      ))}
    </RadioGroup>
  ),
};
