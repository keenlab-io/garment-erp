import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from "./drawer";
import { Button } from "../button/button";

const meta = {
  title: "Primitives/Drawer",
  component: Drawer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PayslipPeek: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary">Open payslip</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="text-h3 font-semibold text-text-primary">
            Payslip — Somchai P.
          </DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <ul className="flex flex-col gap-2 text-sm text-text-secondary">
            {Array.from({ length: 20 }).map((_, i) => (
              <li key={i} className="flex justify-between">
                <span>Line item {i + 1}</span>
                <span className="font-numeric tabular-nums">1,200.00</span>
              </li>
            ))}
          </ul>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="ghost">Close</Button>
          </DrawerClose>
          <Button>Download PDF</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ),
};
