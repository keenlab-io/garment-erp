import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asMoney, asQty } from "@erp/contracts";
import { DocumentLineEditor, emptyDocumentLine, type DocumentLineEditorLine } from "./document-line-editor";

const ITEM_OPTIONS = [
  { value: "i1", label: "FAB-001 · Cotton jersey" },
  { value: "i2", label: "FAB-002 · Poly lining" },
];

const meta = {
  title: "Sales/DocumentLineEditor",
  component: DocumentLineEditor,
  args: {
    lines: [emptyDocumentLine()],
    onLinesChange: () => {},
    itemOptions: ITEM_OPTIONS,
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DocumentLineEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

function Harness() {
  const [lines, setLines] = React.useState<DocumentLineEditorLine[]>([
    { id: "l1", item_id: "i1", description: "Cotton jersey", qty: asQty("200"), unit_price: asMoney("250.00") },
    emptyDocumentLine(),
  ]);
  return (
    <DocumentLineEditor lines={lines} onLinesChange={setLines} itemOptions={ITEM_OPTIONS} />
  );
}

export const Default: Story = {
  render: () => <Harness />,
};

export const WithDiscount: Story = {
  render: () => (
    <DocumentLineEditor
      lines={[
        {
          id: "l1",
          description: "Bulk order — jersey",
          qty: asQty("500"),
          unit_price: asMoney("100.00"),
          discount: asMoney("2500.00"),
        },
      ]}
      onLinesChange={() => {}}
      itemOptions={ITEM_OPTIONS}
    />
  ),
};
