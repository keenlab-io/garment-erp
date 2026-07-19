import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { CostingMethod, ItemType } from "@erp/contracts";
import {
  Button,
  DataTable,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  MaskedValue,
  MoneyCell,
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useCreateItemMutation, useItemsQuery, useLowStockReportQuery } from "../../../inventory/queries.js";
import { StockHealthChip } from "../../../inventory/components/stock-health-chip.js";
import { BarcodePrintDialog } from "../../../inventory/components/barcode-print-dialog.js";

const TYPE_FILTERS: Array<ItemType | "ALL"> = ["ALL", "RAW", "FINISHED", "CONSUMABLE"];

interface ItemRow {
  id: string;
  code: string;
  name: string;
  itemType: ItemType;
  standardCost: string | null;
  minStock: string | null;
}

const TYPE_LABEL_KEY = {
  RAW: "items.itemTypeRaw",
  FINISHED: "items.itemTypeFinished",
  CONSUMABLE: "items.itemTypeConsumable",
} as const satisfies Record<ItemType, string>;

function exportCsv(rows: ItemRow[]) {
  const header = ["code", "name", "item_type", "min_stock"];
  const lines = rows.map((row) => [row.code, row.name, row.itemType, row.minStock ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "items.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function CreateItemDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("inventory");
  const { toast } = useToast();
  const createItem = useCreateItemMutation();

  const [name, setName] = React.useState("");
  const [itemType, setItemType] = React.useState<ItemType>("RAW");
  const [baseUomId, setBaseUomId] = React.useState("");
  const [costingMethod, setCostingMethod] = React.useState<CostingMethod>("MAV");
  const [standardCost, setStandardCost] = React.useState("");
  const [minStock, setMinStock] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName("");
      setItemType("RAW");
      setBaseUomId("");
      setCostingMethod("MAV");
      setStandardCost("");
      setMinStock("");
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    createItem.mutate(
      {
        body: {
          name,
          item_type: itemType,
          base_uom_id: baseUomId,
          costing_method: costingMethod,
          standard_cost: standardCost || undefined,
          min_stock: minStock || undefined,
          attributes: {},
        },
      },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("items.itemCreated") });
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <form onSubmit={handleSubmit} className="flex h-full flex-col">
          <DrawerHeader>
            <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("items.createDrawerTitle")}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-4">
            <FormField label={t("items.fieldName")} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </FormField>
            <FormField label={t("items.fieldItemType")} required>
              <Select value={itemType} onValueChange={(value) => setItemType(value as ItemType)}>
                <SelectTrigger aria-label={t("items.fieldItemType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RAW">{t("items.itemTypeRaw")}</SelectItem>
                  <SelectItem value="FINISHED">{t("items.itemTypeFinished")}</SelectItem>
                  <SelectItem value="CONSUMABLE">{t("items.itemTypeConsumable")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("items.fieldBaseUomId")} help={t("items.baseUomIdHint")} required>
              <Input value={baseUomId} onChange={(e) => setBaseUomId(e.target.value)} required />
            </FormField>
            <FormField label={t("items.fieldCostingMethod")}>
              <Select value={costingMethod} onValueChange={(value) => setCostingMethod(value as CostingMethod)}>
                <SelectTrigger aria-label={t("items.fieldCostingMethod")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAV">{t("items.costingMav")}</SelectItem>
                  <SelectItem value="FIFO">{t("items.costingFifo")}</SelectItem>
                  <SelectItem value="STANDARD">{t("items.costingStandard")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={t("items.fieldStandardCost")}>
              <Input type="number" step="0.0001" value={standardCost} onChange={(e) => setStandardCost(e.target.value)} />
            </FormField>
            <FormField label={t("items.fieldMinStock")}>
              <Input type="number" step="0.0001" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </FormField>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("items.createCancel")}
            </Button>
            <Button type="submit" loading={createItem.isPending}>
              {t("items.createSubmit")}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The items list (M3 §4.1, design MD1/MD5): the Data Table organism over `GET /items`, type
 * filter chips, a low-stock health chip, and bulk barcode/export actions. Standard cost is masked
 * without `inventory.cost.view`; on-hand quantity has no read surface at item grain (only the
 * low-stock report exposes `on_hand`), so the health chip only renders for items the low-stock
 * report actually flags rather than fabricating an "ok" state for every row.
 */
export function ItemsListPage() {
  const { t } = useTranslation("inventory");
  const navigate = useNavigate();
  const { density } = useDensity();

  const [typeFilter, setTypeFilter] = React.useState<ItemType | "ALL">("ALL");
  const [cursorStack, setCursorStack] = React.useState<Array<string | undefined>>([undefined]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [barcodeOpen, setBarcodeOpen] = React.useState(false);
  const cursor = cursorStack[cursorStack.length - 1];

  const items = useItemsQuery({
    ...(cursor ? { cursor } : {}),
    ...(typeFilter === "ALL" ? {} : { "filter[item_type]": typeFilter }),
  });
  const lowStock = useLowStockReportQuery();

  React.useEffect(() => {
    setCursorStack([undefined]);
  }, [typeFilter]);

  const lowStockByItem = React.useMemo(
    () => new Map((lowStock.data?.body.rows ?? []).map((row) => [row.item_id, row])),
    [lowStock.data],
  );

  const rows = React.useMemo<ItemRow[]>(
    () =>
      (items.data?.body.data ?? []).map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        itemType: i.item_type,
        standardCost: i.standard_cost,
        minStock: i.min_stock,
      })),
    [items.data],
  );

  const columns = React.useMemo<ColumnDef<ItemRow>[]>(
    () => [
      textColumn<ItemRow>("code", { header: t("items.columnCode"), mono: true }),
      textColumn<ItemRow>("name", { header: t("items.columnName") }),
      {
        id: "type",
        header: t("items.columnType"),
        meta: { secondary: true },
        cell: ({ row }) => t(TYPE_LABEL_KEY[row.original.itemType]),
      },
      {
        id: "standardCost",
        header: t("items.columnStandardCost"),
        meta: { align: "right" },
        cell: ({ row }) => (
          <MaskedValue
            permission="inventory.cost.view"
            value={row.original.standardCost ? <MoneyCell value={row.original.standardCost} /> : "—"}
          />
        ),
      },
      {
        id: "minStock",
        header: t("items.columnMinStock"),
        meta: { secondary: true, align: "right" },
        cell: ({ row }) => row.original.minStock ?? "—",
      },
      {
        id: "health",
        header: t("items.columnHealth"),
        cell: ({ row }) => {
          const low = lowStockByItem.get(row.original.id);
          return low ? <StockHealthChip onHand={low.on_hand} minStock={low.min_stock} label={t("items.healthNearMin")} /> : null;
        },
      },
    ],
    [t, lowStockByItem],
  );

  const nextCursor = items.data?.body.next_cursor ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("items.title")}</h1>
        <PermissionButton required="inventory.product.create" onClick={() => setCreateOpen(true)}>
          {t("items.createItem")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        tableId="inventory-items"
        density={density}
        isLoading={items.isLoading}
        error={items.isError ? { message: t("items.loadError") } : null}
        onRetry={() => items.refetch()}
        emptyState={{ title: t("items.empty") }}
        nextCursor={nextCursor}
        onNextPage={() => {
          if (nextCursor) setCursorStack((stack) => [...stack, nextCursor]);
        }}
        onPrevPage={cursorStack.length > 1 ? () => setCursorStack((stack) => stack.slice(0, -1)) : undefined}
        enableSelection
        bulkActions={[
          { key: "barcodes", label: t("items.bulkPrintBarcodes"), onClick: () => setBarcodeOpen(true) },
          { key: "export", label: t("items.bulkExport"), onClick: (selected) => exportCsv(selected) },
        ]}
        rowActions={(row) => [
          {
            key: "view",
            label: t("items.viewAction"),
            onClick: () => void navigate({ to: "/inventory/items/$id", params: { id: row.id } }),
          },
        ]}
        toolbar={
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("items.columnType")}>
            {TYPE_FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                aria-pressed={typeFilter === type}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium",
                  typeFilter === type
                    ? "border-accent bg-accent-subtle text-accent-text"
                    : "border-border text-text-secondary hover:bg-bg-sunken",
                )}
              >
                {type === "ALL" ? t("items.filterAll") : t(TYPE_LABEL_KEY[type])}
              </button>
            ))}
          </div>
        }
      />

      <CreateItemDrawer open={createOpen} onOpenChange={setCreateOpen} />
      <BarcodePrintDialog open={barcodeOpen} onOpenChange={setBarcodeOpen} />
    </div>
  );
}
