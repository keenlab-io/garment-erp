import type { Meta, StoryObj } from "@storybook/react-vite";
import { RoutingStatus } from "@erp/contracts";
import { InkChip } from "./ink-chip";
import { routingStatusToChip, type ChipStatus } from "./status";

const meta = {
  title: "Primitives/InkChip",
  component: InkChip,
  args: { status: "in-progress" },
  parameters: { layout: "padded" },
} satisfies Meta<typeof InkChip>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROUTING: ChipStatus[] = ["pending", "in-progress", "completed", "delayed"];
const SHOP: ChipStatus[] = ["hold", "outsourced"];
const DOCUMENT: ChipStatus[] = [
  "draft",
  "sent",
  "issued",
  "approved",
  "converted",
  "expired",
  "rejected",
  "partial",
  "paid",
  "overdue",
  "void",
];
const STOCK: ChipStatus[] = ["stock-ok", "stock-near-min", "stock-dead"];
const AGING: ChipStatus[] = ["aging-current", "aging-1-30", "aging-31-60", "aging-61-90", "aging-90-plus"];

function Row({ title, statuses }: { title: string; statuses: ChipStatus[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-caption uppercase tracking-wide text-text-muted">{title}</h3>
      <div className="flex flex-wrap items-center gap-4">
        {statuses.map((s) => (
          <InkChip key={s} status={s} />
        ))}
      </div>
    </div>
  );
}

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Row title="Routing" statuses={ROUTING} />
      <Row title="Shop floor" statuses={SHOP} />
      <Row title="Document lifecycle" statuses={DOCUMENT} />
      <Row title="Stock health" statuses={STOCK} />
      <Row title="AR aging" statuses={AGING} />
    </div>
  ),
};

export const ActiveState: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <InkChip status="in-progress" />
      <InkChip status="in-progress" active label="In Progress (matched)" />
      <InkChip status="completed" active />
    </div>
  ),
};

export const Touch: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <InkChip status="in-progress" touch />
      <InkChip status="delayed" touch />
      <InkChip status="hold" touch />
    </div>
  ),
};

export const FromRoutingStatus: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {Object.values(RoutingStatus).map((s) => (
        <InkChip key={s} status={routingStatusToChip(s)} />
      ))}
    </div>
  ),
};

/** Proves status stays identifiable without color — glyph + label survive a grayscale filter. */
export const GrayscaleLegibility: Story = {
  render: () => (
    <div className="flex flex-col gap-3" style={{ filter: "grayscale(1)" }}>
      <p className="text-caption text-text-muted">Rendered through a grayscale filter:</p>
      <div className="flex flex-wrap items-center gap-4">
        {[...ROUTING, ...SHOP, ...DOCUMENT, ...AGING].map((s) => (
          <InkChip key={s} status={s} />
        ))}
      </div>
    </div>
  ),
};
