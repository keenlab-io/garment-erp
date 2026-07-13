import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Combobox, type ComboboxOption } from "./combobox";

const CUSTOMERS: ComboboxOption[] = [
  { value: "acme", label: "Acme Textiles" },
  { value: "borey", label: "Borey Garments" },
  { value: "chan", label: "Chan Weaving Co." },
  { value: "delta", label: "Delta Apparel", disabled: true },
];

const meta = {
  title: "Primitives/Combobox",
  component: Combobox,
  args: { options: CUSTOMERS },
  parameters: { layout: "padded" },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: function SingleStory() {
    const [value, setValue] = React.useState<string>();
    return (
      <div className="max-w-xs">
        <Combobox options={CUSTOMERS} value={value} onValueChange={setValue} placeholder="Pick a customer" />
      </div>
    );
  },
};

export const Multi: Story = {
  render: function MultiStory() {
    const [value, setValue] = React.useState<string[]>([]);
    return (
      <div className="max-w-xs">
        <Combobox multiple options={CUSTOMERS} value={value} onValueChange={setValue} placeholder="Pick customers" />
      </div>
    );
  },
};

export const AsyncSearch: Story = {
  render: function AsyncStory() {
    const [value, setValue] = React.useState<string>();
    const [options, setOptions] = React.useState<ComboboxOption[]>(CUSTOMERS);
    const [loading, setLoading] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout>>();
    const onSearch = (q: string) => {
      setLoading(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const query = q.trim().toLowerCase();
        setOptions(CUSTOMERS.filter((o) => o.label.toLowerCase().includes(query)));
        setLoading(false);
      }, 600);
    };
    return (
      <div className="max-w-xs">
        <Combobox
          options={options}
          value={value}
          onValueChange={setValue}
          onSearchChange={onSearch}
          loading={loading}
          placeholder="Search customers"
          emptyMessage="No customers match"
        />
      </div>
    );
  },
};
