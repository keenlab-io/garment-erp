import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "./dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { Button } from "../button/button";

const meta = {
  title: "Primitives/Dialog",
  component: Dialog,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment terms</DialogTitle>
          <p className="text-sm text-text-secondary">Net 30 from the invoice issue date.</p>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const VoidInvoice: Story = {
  render: function VoidStory() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Void invoice
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          destructive
          title="Void invoice QV20260042?"
          consequence="This voids invoice QV20260042 and posts a reversing stock entry. It cannot be undone."
          requireReason
          confirmLabel="Void invoice"
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};

export const ReauthGuarded: Story = {
  render: function ReauthStory() {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete role
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          destructive
          title="Delete the Warehouse role?"
          consequence="This removes the Warehouse role from 6 users and revokes their access immediately."
          requireReason
          requirePassword
          confirmLabel="Delete role"
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};
