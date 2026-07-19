import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  useToast,
} from "@erp/ui";
import { usePrintBarcodesMutation } from "../queries.js";

function splitIds(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export interface BarcodePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Enqueues a barcode-label print job (M3 §4.1/§4.5, design MD5) for SKU and/or lot ids. The
 * contract has no SKU/lot-listing endpoint, so ids are entered by the operator (from a picked
 * label, receiving doc, or a SKU just created on the item detail screen) rather than selected
 * from a fabricated list. `printBarcodes` is fire-and-forget (202, no status endpoint yet — same
 * gap `hr`'s tax exports has), so the job toast resolves to "started", not a download.
 */
export function BarcodePrintDialog({ open, onOpenChange }: BarcodePrintDialogProps) {
  const { t } = useTranslation("inventory");
  const { jobToast } = useToast();
  const printBarcodes = usePrintBarcodesMutation();

  const [skuIds, setSkuIds] = React.useState("");
  const [lotIds, setLotIds] = React.useState("");
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setSkuIds("");
      setLotIds("");
      setError(undefined);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const sku_ids = splitIds(skuIds);
    const lot_ids = splitIds(lotIds);
    if (sku_ids.length === 0 && lot_ids.length === 0) {
      setError(t("barcodes.atLeastOneRequired"));
      return;
    }
    setError(undefined);
    onOpenChange(false);
    const handle = jobToast({ title: t("barcodes.jobPending") });
    try {
      await printBarcodes.mutateAsync({
        body: { sku_ids: sku_ids.length ? sku_ids : undefined, lot_ids: lot_ids.length ? lot_ids : undefined },
      });
      handle.resolve({ tone: "success", title: t("barcodes.jobStarted"), description: t("barcodes.jobStartedBody") });
    } catch {
      handle.resolve({ tone: "danger", title: t("barcodes.jobFailed") });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-h3 font-semibold text-text-primary">{t("barcodes.title")}</DialogTitle>
            <p className="text-sm text-text-secondary">{t("barcodes.description")}</p>
          </DialogHeader>
          <FormField label={t("barcodes.fieldSkuIds")} help={t("barcodes.skuIdsHint")} error={error}>
            <Input value={skuIds} onChange={(e) => setSkuIds(e.target.value)} />
          </FormField>
          <FormField label={t("barcodes.fieldLotIds")} help={t("barcodes.lotIdsHint")}>
            <Input value={lotIds} onChange={(e) => setLotIds(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="submit">{t("barcodes.printAction")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
