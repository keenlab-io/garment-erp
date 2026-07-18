import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import type { Density } from "@erp/design-tokens";
import type { ChipStatus } from "../ink-chip/status";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { DataTable } from "./data-table";
import { moneyColumn, qtyColumn, statusColumn, textColumn } from "./columns";

interface Quotation {
  id: string;
  doc: string;
  customer: string;
  status: ChipStatus;
  amount: string;
  qty: string;
  owner: string;
}

const QUOTATIONS: Quotation[] = [
  { id: "1", doc: "QV20260042", customer: "Siam Textile Co.", status: "issued", amount: "53500.00", qty: "1200", owner: "Nattaya" },
  { id: "2", doc: "QV20260041", customer: "Bangkok Garment", status: "paid", amount: "99000.00", qty: "2400", owner: "Somchai" },
  { id: "3", doc: "QV20260040", customer: "Chiang Mai Weavers", status: "overdue", amount: "12000.00", qty: "300", owner: "Pranee" },
  { id: "4", doc: "QV20260039", customer: "Delta Apparel", status: "partial", amount: "44250.50", qty: "980", owner: "Nattaya" },
  { id: "5", doc: "QV20260038", customer: "Northern Mills", status: "void", amount: "-2000.00", qty: "0", owner: "Somchai" },
  { id: "6", doc: "QV20260037", customer: "Gulf Fashion", status: "draft", amount: "8750.00", qty: "150", owner: "Pranee" },
];

// Thai long-string fixture — verifies dense rows don't clip tone marks and expansion doesn't
// overflow (M0 §7.6). "ใบเสนอราคา" (quotation) and "ที่อยู่" (address) carry upper vowels + tone
// marks stacked above the consonant, the tallest case for row-height clipping.
const QUOTATIONS_TH: Quotation[] = [
  { id: "1", doc: "QV20260042", customer: "บริษัท สยามเท็กซ์ไทล์ จำกัด (มหาชน) — ใบเสนอราคา", status: "issued", amount: "53500.00", qty: "1200", owner: "ณัฐญา ที่อยู่กรุงเทพฯ" },
  { id: "2", doc: "QV20260041", customer: "โรงงานตัดเย็บเสื้อผ้ากรุงเทพมหานคร", status: "paid", amount: "99000.00", qty: "2400", owner: "สมชาย" },
  { id: "3", doc: "QV20260040", customer: "กลุ่มทอผ้าเชียงใหม่ล้านนา ที่อยู่ 99/1 ถ.นิมมานเหมินท์", status: "overdue", amount: "12000.00", qty: "300", owner: "ปราณี" },
];

const columns: ColumnDef<Quotation>[] = [
  textColumn<Quotation>("doc", { header: "Document", sortable: true, mono: true }),
  textColumn<Quotation>("customer", { header: "Customer" }),
  statusColumn<Quotation>("status", { header: "Status" }),
  moneyColumn<Quotation>("amount", { header: "Amount", sortable: true }),
  qtyColumn<Quotation>("qty", { header: "Qty", unit: "pcs", secondary: true }),
  textColumn<Quotation>("owner", { header: "Owner", secondary: true }),
];

const rowActions = () => [
  { key: "open", label: "Open", onClick: () => {} },
  { key: "duplicate", label: "Duplicate", onClick: () => {} },
  { key: "void", label: "Void", destructive: true, onClick: () => {} },
];

const bulkActions = [
  { key: "print", label: "Print barcodes", onClick: () => {} },
  { key: "export", label: "Export", onClick: () => {} },
];

const meta = {
  title: "Organisms/DataTable",
  component: DataTable,
  args: { data: QUOTATIONS, columns, getRowId: (r) => r.id },
  parameters: { layout: "padded" },
} satisfies Meta<typeof DataTable<Quotation>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DataTable
      data={QUOTATIONS}
      columns={columns}
      getRowId={(r) => r.id}
      rowActions={rowActions}
      totalLabel="6 items"
      toolbar={<Input placeholder="Search quotations" className="max-w-64" />}
    />
  ),
};

export const WithSelection: Story = {
  render: () => (
    <DataTable
      data={QUOTATIONS}
      columns={columns}
      getRowId={(r) => r.id}
      enableSelection
      bulkActions={bulkActions}
      rowActions={rowActions}
      totalLabel="6 items"
    />
  ),
};

/** Cursor pagination — the parent owns the page/cursor; the table renders Prev/Next and emits intent. */
export const Pagination: Story = {
  render: function PaginationDemo() {
    const pages = [QUOTATIONS.slice(0, 3), QUOTATIONS.slice(3, 6)];
    const [page, setPage] = React.useState(0);
    const nextCursor = page < pages.length - 1 ? `page-${page + 1}` : null;
    return (
      <DataTable
        data={pages[page]!}
        columns={columns}
        getRowId={(r) => r.id}
        totalLabel="6 items"
        nextCursor={nextCursor}
        onNextPage={() => setPage((p) => Math.min(p + 1, pages.length - 1))}
        onPrevPage={() => setPage((p) => Math.max(p - 1, 0))}
      />
    );
  },
};

/** The same table across all three densities — rows reflow 40/32/64px and Touch drops secondary columns. */
export const DensityMatrix: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {(["comfortable", "compact", "touch"] as Density[]).map((density) => (
        <div key={density} data-density={density}>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
            {density}
          </p>
          <DataTable
            data={QUOTATIONS}
            columns={columns}
            getRowId={(r) => r.id}
            density={density}
            rowActions={rowActions}
            enableSelection
            totalLabel="6 items"
          />
        </div>
      ))}
    </div>
  ),
};

/** Saved column presets — hide columns, Save view, and reload; the arrangement persists per table id. */
export const SavedPresets: Story = {
  render: () => (
    <DataTable
      data={QUOTATIONS}
      columns={columns}
      getRowId={(r) => r.id}
      tableId="quotations-demo"
      totalLabel="6 items"
    />
  ),
};

/**
 * Dense Thai rows across all three densities — set the toolbar locale to `th` (the default) and
 * check every row for clipped tone marks/ascenders at Comfortable and Compact (M0 §7.6). Built-in
 * strings (bulk bar, pagination) come from the `table` namespace default, not a `labels` override,
 * so this also proves @erp/ui's own copy translates when the workbench locale switches.
 */
export const ThaiFixtures: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {(["comfortable", "compact", "touch"] as Density[]).map((density) => (
        <div key={density} data-density={density}>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted [&:lang(th)]:normal-case [&:lang(th)]:tracking-normal">
            {density}
          </p>
          <DataTable
            data={QUOTATIONS_TH}
            columns={columns}
            getRowId={(r) => r.id}
            density={density}
            rowActions={rowActions}
            enableSelection
            totalLabel="3 รายการ"
          />
        </div>
      ))}
    </div>
  ),
};

export const Loading: Story = {
  render: () => <DataTable data={[]} columns={columns} isLoading totalLabel="—" />,
};

export const Empty: Story = {
  render: () => (
    <DataTable
      data={[]}
      columns={columns}
      emptyState={{
        title: "No quotations yet",
        description: "Quotations you create will appear here.",
        action: <Button>New quotation</Button>,
      }}
    />
  ),
};

export const ErrorState: Story = {
  render: () => (
    <DataTable
      data={[]}
      columns={columns}
      error={{ message: "The list service didn't respond. Check your connection and try again." }}
      onRetry={() => {}}
    />
  ),
};
