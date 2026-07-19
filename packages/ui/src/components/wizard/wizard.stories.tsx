import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wizard, WizardNav, type WizardStep } from "./wizard";

const STEPS: WizardStep[] = [
  { key: "lines", label: "Lines" },
  { key: "landed-cost", label: "Landed cost" },
  { key: "confirm", label: "Confirm" },
  { key: "post", label: "Post" },
];

const meta = {
  title: "Primitives/Wizard",
  component: Wizard,
  args: { steps: STEPS, activeStep: "lines", onStepChange: () => {} },
  parameters: { layout: "padded" },
} satisfies Meta<typeof Wizard>;

export default meta;
type Story = StoryObj<typeof meta>;

function GoodsReceiptWizardDemo() {
  const [step, setStep] = React.useState<string>("lines");
  const index = STEPS.findIndex((s) => s.key === step);

  return (
    <Wizard steps={STEPS} activeStep={step} onStepChange={setStep} className="max-w-lg">
      <div className="rounded-md border border-border bg-bg-surface p-4 text-sm text-text-secondary">
        {STEPS[index]?.label} step content goes here.
      </div>
      <WizardNav
        onBack={index > 0 ? () => setStep(STEPS[index - 1]!.key) : undefined}
        onContinue={index < STEPS.length - 1 ? () => setStep(STEPS[index + 1]!.key) : undefined}
        continueLabel={index === STEPS.length - 2 ? "Post" : undefined}
      />
    </Wizard>
  );
}

export const GoodsReceipt: Story = {
  render: () => <GoodsReceiptWizardDemo />,
};

export const ReviewStepBlocked: Story = {
  render: () => (
    <Wizard steps={STEPS} activeStep="lines" onStepChange={() => {}} className="max-w-lg">
      <div className="rounded-md border border-border bg-bg-surface p-4 text-sm text-text-secondary">
        Add at least one line to continue.
      </div>
      <WizardNav continueDisabled onContinue={() => {}} />
    </Wizard>
  ),
};
