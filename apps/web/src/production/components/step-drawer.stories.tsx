import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { asQty, type Defect, type WorkOrderStep } from "@erp/contracts";
import { StepDrawer, type StepDrawerProps } from "./step-drawer";

const STEP: WorkOrderStep = {
  id: "step-1",
  wo_id: "wo-1",
  routing_step_id: "rs-1",
  seq: 2,
  name: "Sew",
  status: "IN_PROGRESS",
  standard_time_min: 30,
  started_at: "2026-07-19T08:00:00.000Z",
  finished_at: null,
  assigned_to: "emp-1",
  machine: "M-04",
  is_delayed: true,
};

const DEFECTS: Defect[] = [{ id: "d-1", wo_step_id: "step-1", type: "Misprint", qty: asQty("2"), note: null }];

/** Wires the drawer's `labels` to the real `production` namespace so the Storybook toolbar's
 * locale control retranslates it (M4 §5.3, mirrors `stock-card-ledger.stories.tsx`'s wiring). */
function Demo(props: Partial<StepDrawerProps>) {
  const { t } = useTranslation("production");
  return (
    <StepDrawer
      open
      onOpenChange={() => {}}
      woNo="WO-114"
      step={STEP}
      defects={DEFECTS}
      onHold={() => {}}
      onSubcontract={() => {}}
      now={new Date("2026-07-19T08:45:00.000Z")}
      {...props}
      labels={{
        assigned: t("stepDrawer.assigned"),
        unassigned: t("stepDrawer.unassigned"),
        machine: t("stepDrawer.machine"),
        noMachine: t("stepDrawer.noMachine"),
        elapsed: t("stepDrawer.elapsed"),
        standard: t("stepDrawer.standard"),
        notStarted: t("stepDrawer.notStarted"),
        minutes: t("stepDrawer.minutes"),
        defects: t("stepDrawer.defects"),
        noDefects: t("stepDrawer.noDefects"),
        hold: t("stepDrawer.hold"),
        holdTitle: t("stepDrawer.holdTitle"),
        holdConsequence: t("stepDrawer.holdConsequence"),
        subcontract: t("stepDrawer.subcontract"),
        subcontractTitle: t("stepDrawer.subcontractTitle"),
        vendorLabel: t("stepDrawer.vendorLabel"),
        slaDueLabel: t("stepDrawer.slaDueLabel"),
        reassign: t("stepDrawer.reassign"),
        assignedToLabel: t("stepDrawer.assignedToLabel"),
        cancel: t("stepDrawer.cancel"),
        send: t("stepDrawer.send"),
      }}
    />
  );
}

const meta = {
  title: "Production/StepDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Delayed: Story = {
  render: () => <Demo assignedToLabel="Somchai P." onReassign={() => {}} />,
};

export const NoDefects: Story = {
  render: () => <Demo defects={[]} />,
};
