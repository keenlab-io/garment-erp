import type { Meta, StoryObj } from "@storybook/react-vite";
import { AttendanceMonthGrid, type AttendanceRecord } from "./attendance-month-grid";

const EMPLOYEES = [
  { id: "e1", name: "Somchai Jaidee" },
  { id: "e2", name: "Suda Boonmee" },
];

const RECORDS: AttendanceRecord[] = [
  { employeeId: "e1", date: "2026-07-01", status: "present" },
  { employeeId: "e1", date: "2026-07-02", status: "present" },
  { employeeId: "e1", date: "2026-07-03", status: "absent" },
  { employeeId: "e1", date: "2026-07-04", status: "leave" },
  { employeeId: "e2", date: "2026-07-01", status: "present" },
  { employeeId: "e2", date: "2026-07-05", status: "holiday" },
];

const meta = {
  title: "HR/AttendanceMonthGrid",
  component: AttendanceMonthGrid,
  args: { period: "2026-07", employees: EMPLOYEES, records: RECORDS },
  parameters: { layout: "padded" },
} satisfies Meta<typeof AttendanceMonthGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { employees: [] },
};
