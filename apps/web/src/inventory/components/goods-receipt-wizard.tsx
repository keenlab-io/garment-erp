import * as React from "react";
import { useTranslation } from "react-i18next";
import { AllocMethod } from "@erp/contracts";
import {
  Button,
  Combobox,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  FormField,
  Input,
  Wizard,
  WizardNav,
  type WizardStep,
} from "@erp/ui";
import { useCreateGoodsReceiptMutation, useConfirmGoodsReceiptMutation, useItemsQuery } from "../queries.js";
import { LandedCostAllocator, type LandedCostAllocatorLabels, type LandedCostLine } from "./landed-cost-allocator.js";
import { UomDualDisplay } from "./uom-dual-display.js";

interface ReceiptLineState {
  id: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice: string;
  unitWeight: string;
  baseQty: string;
  baseUomLabel: string;
}

function emptyLine(): ReceiptLineState {
  return { id: crypto.randomUUID(), itemId: "", uomId: "", qty: "1", unitPrice: "0", unitWeight: "", baseQty: "", baseUomLabel: "" };
}

type WizardStepKey = "lines" | "landed-cost" | "review";

export interface GoodsReceiptWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (code: string) => void;
}

/**
 * The goods-receipt wizard (M3 §4.2, design MD3): lines (scan/search + dual UOM) → landed-cost
 * allocator (live per-line preview) → review, then create + confirm in one submit (`postGoodsReceipt`
 * stays a separate, explicit action on the receipts list — posting creates lots/ledger rows and
 * shouldn't be bundled into the wizard's own submit). The contract has no UOM-conversion read
 * endpoint, so a non-base receiving UOM's base-quantity equivalent is entered by the operator
 * (their own input, never fabricated) purely to drive the dual-UOM display (design "shown, not
 * hidden").
 */
export function GoodsReceiptWizard({ open, onOpenChange, onCreated }: GoodsReceiptWizardProps) {
  const { t } = useTranslation("inventory");
  const items = useItemsQuery({ limit: 100 });
  const createReceipt = useCreateGoodsReceiptMutation();
  const confirmReceipt = useConfirmGoodsReceiptMutation();

  const [step, setStep] = React.useState<WizardStepKey>("lines");
  const [supplierId, setSupplierId] = React.useState("");
  const [lines, setLines] = React.useState<ReceiptLineState[]>([emptyLine()]);
  const [allocMethod, setAllocMethod] = React.useState<AllocMethod>(AllocMethod.VALUE);
  const [freightTotal, setFreightTotal] = React.useState("0");

  React.useEffect(() => {
    if (open) {
      setStep("lines");
      setSupplierId("");
      setLines([emptyLine()]);
      setAllocMethod(AllocMethod.VALUE);
      setFreightTotal("0");
    }
  }, [open]);

  const itemOptions = (items.data?.body.data ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }));
  const itemById = new Map((items.data?.body.data ?? []).map((i) => [i.id, i]));

  function updateLine(id: string, patch: Partial<ReceiptLineState>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  const linesValid = lines.length > 0 && lines.every((l) => l.itemId && l.uomId && l.qty && l.unitPrice);

  const previewLines: LandedCostLine[] = lines.map((l) => ({
    id: l.id,
    itemLabel: itemById.get(l.itemId)?.name ?? l.itemId,
    qty: l.qty,
    unitPrice: l.unitPrice,
    unitWeight: l.unitWeight || null,
  }));

  async function handleSubmit() {
    const created = await createReceipt.mutateAsync({
      body: {
        supplier_id: supplierId,
        lines: lines.map((l) => ({
          item_id: l.itemId,
          uom_id: l.uomId,
          qty: l.qty,
          unit_price: l.unitPrice,
          unit_weight: l.unitWeight || undefined,
        })),
        landed_cost_total: freightTotal || undefined,
        alloc_method: allocMethod,
      },
    });
    await confirmReceipt.mutateAsync({ params: { id: created.body.receipt.id }, body: undefined });
    onCreated(created.body.receipt.code);
    onOpenChange(false);
  }

  const wizardSteps: WizardStep[] = [
    { key: "lines", label: t("receipts.stepLines") },
    { key: "landed-cost", label: t("receipts.stepLandedCost") },
    { key: "review", label: t("receipts.stepReview") },
  ];

  const landedCostLabels: LandedCostAllocatorLabels = {
    methodLabel: t("landedCost.methodLabel"),
    methodValue: t("landedCost.methodValue"),
    methodWeight: t("landedCost.methodWeight"),
    methodQty: t("landedCost.methodQty"),
    freightLabel: t("landedCost.freightLabel"),
    itemColumn: t("landedCost.itemColumn"),
    qtyColumn: t("landedCost.qtyColumn"),
    allocatedColumn: t("landedCost.allocatedColumn"),
    unitCostColumn: t("landedCost.unitCostColumn"),
    totalLabel: t("landedCost.totalLabel"),
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined} className="sm:max-w-2xl">
        <DrawerHeader>
          <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("receipts.newReceipt")}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4">
          <Wizard steps={wizardSteps} activeStep={step} onStepChange={(key) => setStep(key as typeof step)}>
            {step === "lines" && (
              <div className="flex flex-col gap-4">
                <FormField label={t("receipts.fieldSupplierId")} required>
                  <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required />
                </FormField>
                {lines.map((line) => {
                  const selected = itemById.get(line.itemId);
                  const showDualUom = selected && line.uomId && line.uomId !== selected.base_uom_id;
                  return (
                    <div key={line.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <FormField label={t("receipts.fieldItem")} className="min-w-48 flex-1">
                          <Combobox
                            value={line.itemId}
                            onValueChange={(value) => updateLine(line.id, { itemId: value, uomId: itemById.get(value)?.base_uom_id ?? line.uomId })}
                            options={itemOptions}
                            loading={items.isLoading}
                            aria-label={t("receipts.fieldItem")}
                          />
                        </FormField>
                        <FormField label={t("receipts.fieldUom")}>
                          <Input value={line.uomId} onChange={(e) => updateLine(line.id, { uomId: e.target.value })} className="w-40" />
                        </FormField>
                        <FormField label={t("receipts.fieldQty")}>
                          <Input type="number" value={line.qty} onChange={(e) => updateLine(line.id, { qty: e.target.value })} className="w-24" />
                        </FormField>
                        <FormField label={t("receipts.fieldUnitPrice")}>
                          <Input
                            type="number"
                            step="0.0001"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                            className="w-28"
                          />
                        </FormField>
                        <FormField label={t("receipts.fieldUnitWeight")}>
                          <Input
                            type="number"
                            value={line.unitWeight}
                            onChange={(e) => updateLine(line.id, { unitWeight: e.target.value })}
                            className="w-24"
                          />
                        </FormField>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                          disabled={lines.length === 1}
                        >
                          {t("receipts.removeLine")}
                        </Button>
                      </div>
                      {showDualUom && (
                        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-2">
                          <p className="text-caption text-text-muted">{t("receipts.dualUomHint")}</p>
                          <FormField label={t("receipts.fieldBaseQty")}>
                            <Input
                              type="number"
                              value={line.baseQty}
                              onChange={(e) => updateLine(line.id, { baseQty: e.target.value })}
                              className="w-28"
                            />
                          </FormField>
                          <FormField label={t("receipts.fieldBaseUomLabel")}>
                            <Input
                              value={line.baseUomLabel}
                              onChange={(e) => updateLine(line.id, { baseUomLabel: e.target.value })}
                              className="w-32"
                            />
                          </FormField>
                          {line.baseQty && line.baseUomLabel && (
                            <UomDualDisplay qty={line.qty} uomLabel={line.uomId} baseQty={line.baseQty} baseUomLabel={line.baseUomLabel} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button type="button" variant="secondary" onClick={() => setLines((prev) => [...prev, emptyLine()])} className="self-start">
                  {t("receipts.addLine")}
                </Button>
                <WizardNav onContinue={() => setStep("landed-cost")} continueDisabled={!linesValid} continueLabel={t("receipts.continueLabel")} />
              </div>
            )}

            {step === "landed-cost" && (
              <div className="flex flex-col gap-4">
                <LandedCostAllocator
                  lines={previewLines}
                  method={allocMethod}
                  onMethodChange={setAllocMethod}
                  freightTotal={freightTotal}
                  onFreightTotalChange={setFreightTotal}
                  labels={landedCostLabels}
                />
                <WizardNav onBack={() => setStep("lines")} onContinue={() => setStep("review")} continueLabel={t("receipts.continueLabel")} />
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold text-text-primary">{t("receipts.reviewTitle")}</h3>
                <LandedCostAllocator
                  lines={previewLines}
                  method={allocMethod}
                  onMethodChange={setAllocMethod}
                  freightTotal={freightTotal}
                  onFreightTotalChange={setFreightTotal}
                  labels={landedCostLabels}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => setStep("landed-cost")}>
                    {t("receipts.back")}
                  </Button>
                  <Button type="button" onClick={() => void handleSubmit()} loading={createReceipt.isPending || confirmReceipt.isPending}>
                    {t("receipts.createAndConfirm")}
                  </Button>
                </div>
              </div>
            )}
          </Wizard>
        </DrawerBody>
        <DrawerFooter />
      </DrawerContent>
    </Drawer>
  );
}
