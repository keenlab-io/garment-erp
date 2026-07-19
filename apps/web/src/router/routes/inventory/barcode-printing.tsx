import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, useToast } from "@erp/ui";
import { usePrintBarcodesMutation } from "../../../inventory/queries.js";

function splitIds(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * The barcode-printing screen (M3 §4.5, design MD5). The contract has no SKU/lot-listing endpoint,
 * so ids are entered directly (from the item detail SKUs tab, a receiving doc, or a physical label)
 * rather than selected from a fabricated list — the same approach the items list's bulk "Print
 * barcodes" action uses via `BarcodePrintDialog`.
 */
export function BarcodePrintingPage() {
  const { t } = useTranslation("inventory");
  const { jobToast } = useToast();
  const printBarcodes = usePrintBarcodesMutation();

  const [skuIds, setSkuIds] = React.useState("");
  const [lotIds, setLotIds] = React.useState("");
  const [error, setError] = React.useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const sku_ids = splitIds(skuIds);
    const lot_ids = splitIds(lotIds);
    if (sku_ids.length === 0 && lot_ids.length === 0) {
      setError(t("barcodes.atLeastOneRequired"));
      return;
    }
    setError(undefined);
    const handle = jobToast({ title: t("barcodes.jobPending") });
    try {
      await printBarcodes.mutateAsync({
        body: { sku_ids: sku_ids.length ? sku_ids : undefined, lot_ids: lot_ids.length ? lot_ids : undefined },
      });
      handle.resolve({ tone: "success", title: t("barcodes.jobStarted"), description: t("barcodes.jobStartedBody") });
      setSkuIds("");
      setLotIds("");
    } catch {
      handle.resolve({ tone: "danger", title: t("barcodes.jobFailed") });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("barcodes.title")}</h1>
        <p className="text-sm text-text-secondary">{t("barcodes.description")}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border bg-bg-surface p-5 shadow-sm">
        <FormField label={t("barcodes.fieldSkuIds")} help={t("barcodes.skuIdsHint")} error={error}>
          <Input value={skuIds} onChange={(e) => setSkuIds(e.target.value)} />
        </FormField>
        <FormField label={t("barcodes.fieldLotIds")} help={t("barcodes.lotIdsHint")}>
          <Input value={lotIds} onChange={(e) => setLotIds(e.target.value)} />
        </FormField>
        <Button type="submit" loading={printBarcodes.isPending} className="self-start">
          {t("barcodes.printAction")}
        </Button>
      </form>
    </div>
  );
}
