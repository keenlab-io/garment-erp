import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import type { ChipStatus } from "../ink-chip/status";
import { DataTable, type DataTableProps } from "./data-table";
import { moneyColumn, qtyColumn, statusColumn, textColumn } from "./columns";
import { useColumnPresets } from "./use-column-presets";
import { renderHook, act } from "@testing-library/react";

interface Row {
  id: string;
  doc: string;
  status: ChipStatus;
  amount: string;
  qty: string;
  note: string;
}

const ROWS: Row[] = [
  { id: "1", doc: "QV20260042", status: "issued", amount: "53500.00", qty: "12", note: "rush" },
  { id: "2", doc: "QV20260041", status: "paid", amount: "1240.5", qty: "4", note: "standard" },
  { id: "3", doc: "QV20260040", status: "void", amount: "-2000.00", qty: "1", note: "cancelled" },
];

const COLUMNS: ColumnDef<Row>[] = [
  textColumn<Row>("doc", { header: "Document", sortable: true, mono: true }),
  statusColumn<Row>("status", { header: "Status" }),
  moneyColumn<Row>("amount", { header: "Amount", sortable: true }),
  qtyColumn<Row>("qty", { header: "Qty", unit: "pcs", secondary: true }),
  textColumn<Row>("note", { header: "Note", secondary: true }),
];

function setup(props: Partial<DataTableProps<Row>> = {}) {
  return render(<DataTable data={ROWS} columns={COLUMNS} getRowId={(r) => r.id} {...props} />);
}

afterEach(() => {
  window.localStorage.clear();
});

describe("DataTable", () => {
  it("renders a row per datum with the column headers", () => {
    setup();
    expect(screen.getByRole("columnheader", { name: /Document/ })).toBeInTheDocument();
    expect(screen.getByText("QV20260042")).toBeInTheDocument();
    expect(screen.getByText("QV20260041")).toBeInTheDocument();
    expect(screen.getByText("QV20260040")).toBeInTheDocument();
  });

  it("cycles a sortable header asc → desc → none and emits the sort state", async () => {
    const onSortingChange = vi.fn();
    setup({ onSortingChange });
    const amount = screen.getByRole("button", { name: /Amount/ });

    await userEvent.click(amount);
    expect(onSortingChange).toHaveBeenLastCalledWith([{ id: "amount", desc: false }]);

    await userEvent.click(amount);
    expect(onSortingChange).toHaveBeenLastCalledWith([{ id: "amount", desc: true }]);
    expect(amount.closest("th")).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(amount);
    expect(onSortingChange).toHaveBeenLastCalledWith([]);
    expect(amount.closest("th")).toHaveAttribute("aria-sort", "none");
  });

  it("renders money columns right-aligned in tabular figures", () => {
    setup();
    const cell = screen.getByText("฿1,240.50");
    expect(cell).toHaveClass("text-right");
    expect(cell).toHaveClass("tabular-nums");
    // Negative money is weighted danger + parenthesized.
    expect(screen.getByText("(฿2,000.00)")).toHaveClass("text-danger");
  });

  describe("cursor pagination", () => {
    it("offers a next-page action while the cursor is non-null", async () => {
      const onNextPage = vi.fn();
      setup({ nextCursor: "abc", onNextPage, totalLabel: "248 items" });
      const next = screen.getByRole("button", { name: "Next" });
      expect(next).toBeEnabled();
      await userEvent.click(next);
      expect(onNextPage).toHaveBeenCalledOnce();
      expect(screen.getByText("248 items")).toBeInTheDocument();
    });

    it("disables next and shows the end-of-list state when the cursor is null", () => {
      setup({ nextCursor: null, onNextPage: vi.fn(), totalLabel: "3 items" });
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
      expect(screen.getByText("End of list")).toBeInTheDocument();
    });

    it("requests the previous page", async () => {
      const onPrevPage = vi.fn();
      setup({ nextCursor: "abc", onNextPage: vi.fn(), onPrevPage });
      await userEvent.click(screen.getByRole("button", { name: "Previous" }));
      expect(onPrevPage).toHaveBeenCalledOnce();
    });
  });

  describe("selection + bulk actions", () => {
    it("shows the bulk bar with the count when rows are selected and clears it", async () => {
      const print = vi.fn();
      setup({
        enableSelection: true,
        bulkActions: [{ key: "print", label: "Print barcodes", onClick: print }],
      });

      const rowBoxes = screen.getAllByRole("checkbox", { name: "Select row" });
      await userEvent.click(rowBoxes[0]!);
      await userEvent.click(rowBoxes[1]!);

      const bar = screen.getByRole("region", { name: "2 selected" });
      expect(within(bar).getByText("2 selected")).toBeInTheDocument();

      await userEvent.click(within(bar).getByRole("button", { name: "Print barcodes" }));
      expect(print).toHaveBeenCalledWith([ROWS[0], ROWS[1]]);

      await userEvent.click(within(bar).getByRole("button", { name: "Clear" }));
      expect(screen.queryByRole("region", { name: /selected/ })).not.toBeInTheDocument();
    });

    it("selects all rows from the header checkbox", async () => {
      setup({ enableSelection: true });
      await userEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
      expect(screen.getByRole("region", { name: "3 selected" })).toBeInTheDocument();
    });
  });

  it("moves the active row with arrows and toggles selection with space", async () => {
    const { container } = setup({ enableSelection: true });
    const rowEls = container.querySelectorAll<HTMLTableRowElement>("[data-row-index]");
    rowEls[0]!.focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(rowEls[1]).toHaveAttribute("data-active");

    await userEvent.keyboard(" ");
    // The active row (index 1) is now selected — the bulk bar reflects one selection.
    expect(screen.getByRole("region", { name: "1 selected" })).toBeInTheDocument();
  });

  describe("density", () => {
    it("shows secondary columns in comfortable density", () => {
      setup({ density: "comfortable" });
      expect(screen.getByRole("columnheader", { name: "Note" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: /Qty/ })).toBeInTheDocument();
    });

    it("hides secondary columns in touch density", () => {
      setup({ density: "touch" });
      expect(screen.queryByRole("columnheader", { name: "Note" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: /Qty/ })).not.toBeInTheDocument();
      // Essential columns remain.
      expect(screen.getByRole("columnheader", { name: /Document/ })).toBeInTheDocument();
    });
  });

  describe("states", () => {
    it("renders skeleton rows while loading", () => {
      const { container } = setup({ isLoading: true });
      expect(container.querySelectorAll(".erp-skeleton").length).toBeGreaterThan(0);
      expect(screen.queryByText("QV20260042")).not.toBeInTheDocument();
    });

    it("renders the empty state with its CTA when there are no rows", () => {
      setup({
        data: [],
        emptyState: { title: "No quotations yet", description: "Create your first one.", action: <button>New quotation</button> },
      });
      expect(screen.getByText("No quotations yet")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New quotation" })).toBeInTheDocument();
    });

    it("renders the error state with a working retry", async () => {
      const onRetry = vi.fn();
      setup({ error: { message: "Network unreachable" }, onRetry });
      const alert = screen.getByRole("alert");
      expect(within(alert).getByText("Network unreachable")).toBeInTheDocument();
      await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
      expect(onRetry).toHaveBeenCalledOnce();
    });
  });

  describe("row actions", () => {
    it("opens the per-row overflow menu and fires an action", async () => {
      const onEdit = vi.fn();
      setup({ rowActions: () => [{ key: "edit", label: "Edit", onClick: onEdit }] });
      await userEvent.click(screen.getAllByRole("button", { name: "Row actions" })[0]!);
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
      expect(onEdit).toHaveBeenCalledOnce();
    });
  });

  describe("column presets", () => {
    it("hides a column via the menu and persists it across remounts for the same table id", async () => {
      const { unmount } = setup({ tableId: "quotations" });

      await userEvent.click(screen.getByRole("button", { name: /Columns/ }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Document" }));
      expect(screen.queryByRole("columnheader", { name: /Document/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Save view" }));
      unmount();

      setup({ tableId: "quotations" });
      expect(screen.queryByRole("columnheader", { name: /Document/ })).not.toBeInTheDocument();
    });
  });

  describe("i18n defaults (M0 §7)", () => {
    it("resolves built-in labels through the `table` namespace, not a hardcoded literal", () => {
      setup({ enableSelection: true });
      // vitest.setup.ts initializes the shared i18next instance with the real `table` English
      // resources — asserting against them (not the string again) catches drift if the resource
      // key is renamed without updating the component.
      expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
    });

    it("still lets a `labels` override win over the i18next default", () => {
      setup({ labels: { columns: "Fields" } });
      expect(screen.getByRole("button", { name: "Fields" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
    });
  });

  describe("Thai typesetting (M0 §7.6)", () => {
    it("resets uppercase/letter-spacing on header text for :lang(th) (never on Thai)", () => {
      setup();
      const header = screen.getByRole("columnheader", { name: /Document/ });
      expect(header.className).toContain("uppercase");
      expect(header.className).toContain("tracking-wide");
      expect(header.className).toContain("[&:lang(th)]:normal-case");
      expect(header.className).toContain("[&:lang(th)]:tracking-normal");
    });

    it("gives body cells at least the Thai-safe 1.6 line-height (leading-normal)", () => {
      setup();
      const cell = screen.getByText("QV20260042").closest("td");
      expect(cell?.className).toContain("leading-normal");
    });

    it("keeps numeric cells at the compact leading — digits have no ascenders/tone marks to clip", () => {
      setup();
      const amount = screen.getByText("฿53,500.00");
      expect(amount.className).toContain("leading-tight");
    });
  });
});

describe("useColumnPresets", () => {
  afterEach(() => window.localStorage.clear());

  it("saves and restores visibility and sorting for a table id", () => {
    const { result, unmount } = renderHook(() => useColumnPresets("t1"));

    act(() => {
      result.current.onColumnVisibilityChange({ note: false });
      result.current.onSortingChange([{ id: "amount", desc: true }]);
    });
    act(() => result.current.savePreset());
    unmount();

    const { result: reloaded } = renderHook(() => useColumnPresets("t1"));
    expect(reloaded.current.columnVisibility).toEqual({ note: false });
    expect(reloaded.current.sorting).toEqual([{ id: "amount", desc: true }]);
  });

  it("reset clears the saved preset", () => {
    const { result } = renderHook(() => useColumnPresets("t2"));
    act(() => result.current.onColumnVisibilityChange({ note: false }));
    act(() => result.current.savePreset());
    act(() => result.current.resetPreset());
    expect(result.current.columnVisibility).toEqual({});

    const { result: reloaded } = renderHook(() => useColumnPresets("t2"));
    expect(reloaded.current.columnVisibility).toEqual({});
  });
});
