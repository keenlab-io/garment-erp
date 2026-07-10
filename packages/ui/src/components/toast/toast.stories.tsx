import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToastProvider, useToast } from "./toast";
import { Button } from "../button/button";

const meta = {
  title: "Primitives/Toast",
  component: ToastProvider,
  args: { children: null },
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToastProvider>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const { toast, jobToast } = useToast();
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => toast({ title: "Saved", tone: "success" })}>
        Show toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: "Payment recorded",
            description: "฿16,520.00 applied to QV20260042.",
            tone: "info",
            action: { label: "View", onClick: () => {} },
          })
        }
      >
        With action
      </Button>
      <Button
        onClick={() => {
          const job = jobToast({ title: "Generating PDF", description: "We'll notify you when it's ready." });
          setTimeout(
            () =>
              job.resolve({
                title: "Invoice ready",
                tone: "success",
                action: { label: "Download", onClick: () => {} },
              }),
            2000,
          );
        }}
      >
        Run export (job toast)
      </Button>
    </div>
  );
}

export const Playground: Story = {
  render: () => (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  ),
};
