import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTranslation } from "react-i18next";
import { PermissionsProvider } from "@erp/ui";
import {
  CashAdvanceApprovalCard,
  type CashAdvanceApprovalCardLabels,
} from "./cash-advance-approval-card";
import type { CeilingCheckBadgeLabels } from "./ceiling-check-badge";

/** Wires the card's + its ceiling badge's `labels` to the real `hr` namespace so the Storybook
 * toolbar's locale control retranslates the card (M2 §5.3, mirrors `cash-advance-approvals.tsx`). */
function useCardLabels(): { labels: CashAdvanceApprovalCardLabels; ceilingLabels: CeilingCheckBadgeLabels } {
  const { t } = useTranslation("hr");
  return {
    labels: {
      amountLabel: t("approvals.cardAmountLabel"),
      reasonLabel: t("approvals.cardReasonLabel"),
      noReason: t("approvals.cardNoReason"),
      approve: t("approvals.cardApprove"),
      reject: t("approvals.cardReject"),
      approveTitle: (employeeName) => t("approvals.cardApproveTitle", { employeeName }),
      approveConsequence: (employeeName) => t("approvals.cardApproveConsequence", { employeeName }),
      rejectTitle: (employeeName) => t("approvals.cardRejectTitle", { employeeName }),
      rejectConsequence: (employeeName) => t("approvals.cardRejectConsequence", { employeeName }),
      superAdminOnly: t("approvals.cardSuperAdminOnly"),
    },
    ceilingLabels: {
      within: t("approvals.ceilingWithin"),
      approaching: t("approvals.ceilingApproaching"),
      over: t("approvals.ceilingOver"),
    },
  };
}

const meta = {
  title: "HR/CashAdvanceApprovalCard",
  component: CashAdvanceApprovalCard,
  args: {
    employeeName: "Somchai Jaidee",
    amount: "4500.00",
    ceiling: "10000.00",
    reason: "Motorbike repair",
    status: "SUBMITTED",
    onApprove: () => {},
    onReject: () => {},
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof CashAdvanceApprovalCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuperAdminView: Story = {
  render: (args) => {
    const { labels, ceilingLabels } = useCardLabels();
    return (
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
        <CashAdvanceApprovalCard {...args} labels={labels} ceilingLabels={ceilingLabels} />
      </PermissionsProvider>
    );
  },
};

export const RegularApproverView: Story = {
  render: (args) => {
    const { labels, ceilingLabels } = useCardLabels();
    return (
      <PermissionsProvider permissions={[]} isSuperAdmin={false}>
        <CashAdvanceApprovalCard {...args} labels={labels} ceilingLabels={ceilingLabels} />
      </PermissionsProvider>
    );
  },
};

export const NearCeiling: Story = {
  args: { amount: "9200.00" },
  render: (args) => {
    const { labels, ceilingLabels } = useCardLabels();
    return (
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
        <CashAdvanceApprovalCard {...args} labels={labels} ceilingLabels={ceilingLabels} />
      </PermissionsProvider>
    );
  },
};

export const AlreadyApproved: Story = {
  args: { status: "APPROVED" },
  render: (args) => {
    const { labels, ceilingLabels } = useCardLabels();
    return (
      <PermissionsProvider permissions={["hr.salary.view"]} isSuperAdmin>
        <CashAdvanceApprovalCard {...args} labels={labels} ceilingLabels={ceilingLabels} />
      </PermissionsProvider>
    );
  },
};
