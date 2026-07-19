import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import type { WorkOrderTimelineEntry } from "@erp/contracts";
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
  PermissionButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Wizard,
  WizardNav,
  type WizardStep,
  statusColumn,
  textColumn,
  useToast,
} from "@erp/ui";
import { useDensity } from "../../../density/density-context.js";
import { useDateFormat } from "../../../i18n/use-formatters.js";
import {
  useCreateWorkOrderMutation,
  useRoutingTemplatesQuery,
  useWorkOrderTimelineQuery,
} from "../../../production/queries.js";
import { workOrderStatusToChip } from "../../../production/chip-status.js";

type WizardStepKey = "details" | "review";

function CreateWorkOrderDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation("production");
  const { toast } = useToast();
  const templates = useRoutingTemplatesQuery({ limit: 100 });
  const createWorkOrder = useCreateWorkOrderMutation();

  const [step, setStep] = React.useState<WizardStepKey>("details");
  const [routingTemplateId, setRoutingTemplateId] = React.useState("");
  const [finishedItemId, setFinishedItemId] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [qty, setQty] = React.useState("1");
  const [dueDate, setDueDate] = React.useState("");
  const [machine, setMachine] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setStep("details");
      setRoutingTemplateId("");
      setFinishedItemId("");
      setCustomerId("");
      setQty("1");
      setDueDate("");
      setMachine("");
    }
  }, [open]);

  const templateOptions = templates.data?.body.data ?? [];
  const selectedTemplate = templateOptions.find((t) => t.id === routingTemplateId);
  const detailsValid = Boolean(routingTemplateId && finishedItemId && qty);

  async function handleSubmit() {
    await createWorkOrder.mutateAsync({
      body: {
        routing_template_id: routingTemplateId,
        finished_item_id: finishedItemId,
        customer_id: customerId || undefined,
        qty,
        due_date: dueDate || undefined,
        machine: machine || undefined,
      },
    });
    toast({ tone: "success", title: t("workOrders.created") });
    onOpenChange(false);
  }

  const wizardSteps: WizardStep[] = [
    { key: "details", label: t("workOrders.stepDetails") },
    { key: "review", label: t("workOrders.stepReview") },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle className="text-h3 font-semibold text-text-primary">{t("workOrders.newWorkOrder")}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4">
          <Wizard steps={wizardSteps} activeStep={step} onStepChange={(key) => setStep(key as WizardStepKey)}>
            {step === "details" && (
              <div className="flex flex-col gap-3">
                <FormField label={t("workOrders.fieldRoutingTemplate")} required>
                  <Select value={routingTemplateId} onValueChange={setRoutingTemplateId}>
                    <SelectTrigger aria-label={t("workOrders.fieldRoutingTemplate")}>
                      <SelectValue placeholder={t("workOrders.selectRoutingTemplate")} />
                    </SelectTrigger>
                    <SelectContent>
                      {templateOptions.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label={t("workOrders.fieldFinishedItemId")} help={t("workOrders.itemIdHint")} required>
                  <Input value={finishedItemId} onChange={(e) => setFinishedItemId(e.target.value)} required />
                </FormField>
                <FormField label={t("workOrders.fieldCustomerId")} help={t("workOrders.customerIdHint")}>
                  <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
                </FormField>
                <FormField label={t("workOrders.fieldQty")} required>
                  <Input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
                </FormField>
                <FormField label={t("workOrders.fieldDueDate")}>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </FormField>
                <FormField label={t("workOrders.fieldMachine")}>
                  <Input value={machine} onChange={(e) => setMachine(e.target.value)} />
                </FormField>
                <WizardNav
                  onContinue={() => setStep("review")}
                  continueDisabled={!detailsValid}
                  continueLabel={t("workOrders.continueLabel")}
                />
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-caption text-text-muted">{t("workOrders.fieldRoutingTemplate")}</dt>
                    <dd className="text-text-primary">{selectedTemplate?.name ?? routingTemplateId}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-text-muted">{t("workOrders.fieldFinishedItemId")}</dt>
                    <dd className="font-mono text-mono text-text-primary">{finishedItemId}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-text-muted">{t("workOrders.fieldQty")}</dt>
                    <dd className="text-text-primary">{qty}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-text-muted">{t("workOrders.fieldDueDate")}</dt>
                    <dd className="text-text-primary">{dueDate || "—"}</dd>
                  </div>
                </dl>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" onClick={() => setStep("details")}>
                    {t("workOrders.back")}
                  </Button>
                  <Button type="button" onClick={() => void handleSubmit()} loading={createWorkOrder.isPending}>
                    {t("workOrders.createWorkOrder")}
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

/**
 * The work-order list (M4 §4.2, design MD1). The `production` contract has no standalone
 * `listWorkOrders` — `workOrderTimeline` (the Gantt feed's own data source) doubles as the list
 * read here, same gap `inventory`'s item-detail documents for its own module.
 */
export function WorkOrdersListPage() {
  const { t } = useTranslation("production");
  const navigate = useNavigate();
  const { density } = useDensity();
  const dateFormat = useDateFormat({ dateStyle: "medium" });
  const [createOpen, setCreateOpen] = React.useState(false);

  const timeline = useWorkOrderTimelineQuery();
  const rows = timeline.data?.body.data ?? [];

  const columns = React.useMemo<ColumnDef<WorkOrderTimelineEntry>[]>(
    () => [
      textColumn<WorkOrderTimelineEntry>("wo_no", { header: t("workOrders.columnWoNo"), mono: true }),
      {
        id: "dueDate",
        header: t("workOrders.columnDueDate"),
        meta: { secondary: true },
        cell: ({ row }) => (row.original.due_date ? dateFormat.format(new Date(row.original.due_date)) : "—"),
      },
      {
        id: "steps",
        header: t("workOrders.columnSteps"),
        meta: { secondary: true },
        cell: ({ row }) => `${row.original.steps.filter((s) => s.status === "COMPLETED").length}/${row.original.steps.length}`,
      },
      statusColumn<WorkOrderTimelineEntry, WorkOrderTimelineEntry["status"]>("status", {
        header: t("workOrders.columnStatus"),
        resolve: (value) => workOrderStatusToChip(value),
      }),
    ],
    [t, dateFormat],
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-h1 font-semibold text-text-primary">{t("workOrders.title")}</h1>
        <PermissionButton required="production.wo.manage" onClick={() => setCreateOpen(true)}>
          {t("workOrders.newWorkOrder")}
        </PermissionButton>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        tableId="production-work-orders"
        density={density}
        isLoading={timeline.isLoading}
        error={timeline.isError ? { message: t("workOrders.loadError") } : null}
        onRetry={() => timeline.refetch()}
        emptyState={{ title: t("workOrders.empty") }}
        rowActions={(row) => [
          {
            key: "view",
            label: t("workOrders.viewAction"),
            onClick: () => void navigate({ to: "/production/work-orders/$id", params: { id: row.id } }),
          },
        ]}
      />

      <CreateWorkOrderDrawer open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
