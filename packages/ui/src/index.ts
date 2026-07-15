// Public API for @erp/ui — the owned Radix + token component layer.

export { cn, cva, type VariantProps } from "./lib/cn.js";

// Primitives (Group 3)
export { Icon, type IconProps } from "./components/icon/icon.js";
export { Button, buttonVariants, type ButtonProps } from "./components/button/button.js";
export { InkChip, type InkChipProps } from "./components/ink-chip/ink-chip.js";
export {
  chipMeta,
  routingStatusToChip,
  type ChipStatus,
  type ChipMeta,
  type SemanticChipStatus,
} from "./components/ink-chip/status.js";
export {
  MoneyCell,
  QtyCell,
  type MoneyCellProps,
  type QtyCellProps,
} from "./components/numeric-cell/numeric-cell.js";
export { Input, type InputProps } from "./components/input/input.js";
export { Checkbox, type CheckboxProps } from "./components/checkbox/checkbox.js";
export {
  RadioGroup,
  Radio,
  type RadioGroupProps,
  type RadioProps,
} from "./components/radio/radio-group.js";
export { Switch, type SwitchProps } from "./components/switch/switch.js";
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./components/select/select.js";
export {
  Combobox,
  type ComboboxProps,
  type ComboboxOption,
} from "./components/combobox/combobox.js";
export { FormField, type FormFieldProps } from "./components/form-field/form-field.js";
export { Tooltip, TooltipProvider, type TooltipProps } from "./components/tooltip/tooltip.js";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge/badge.js";
export { Avatar, type AvatarProps } from "./components/avatar/avatar.js";
export { Skeleton, type SkeletonProps } from "./components/skeleton/skeleton.js";
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastOptions,
  type ToastTone,
  type JobToastHandle,
  type ToastProviderProps,
} from "./components/toast/toast.js";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from "./components/dialog/dialog.js";
export {
  ConfirmDialog,
  type ConfirmDialogProps,
  type ConfirmResult,
} from "./components/dialog/confirm-dialog.js";
export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerTitle,
  DrawerDescription,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
} from "./components/drawer/drawer.js";

// Data Table organism (Group 5)
export {
  DataTable,
  type DataTableProps,
  type DataTableLabels,
  type DataTableEmptyState,
  type BulkAction,
  type RowAction,
} from "./components/data-table/data-table.js";
export {
  textColumn,
  moneyColumn,
  qtyColumn,
  statusColumn,
} from "./components/data-table/columns.js";
export {
  useColumnPresets,
  type ColumnPresetState,
  type ColumnPresetsApi,
  type UseColumnPresetsOptions,
} from "./components/data-table/use-column-presets.js";
