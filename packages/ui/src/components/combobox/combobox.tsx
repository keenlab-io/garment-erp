import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { ChevronsUpDown, Check, Search, Loader2 } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { controlSurface, controlSizing } from "../../lib/control.js";

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ComboboxBaseProps {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Called as the query changes — provide it (with `loading`) to drive async server-side search. */
  onSearchChange?: (query: string) => void;
  /** Show the in-list loading state while async options are being fetched. */
  loading?: boolean;
  /** Message shown when no option matches. */
  emptyMessage?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}

interface SingleComboboxProps extends ComboboxBaseProps {
  multiple?: false;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface MultiComboboxProps extends ComboboxBaseProps {
  multiple: true;
  value?: string[];
  onValueChange?: (value: string[]) => void;
}

export type ComboboxProps = SingleComboboxProps | MultiComboboxProps;

/**
 * A combobox on Radix Popover: a filterable list with single or multi selection. Filtering is local
 * by default; pass `onSearchChange` + `loading` to drive async server-side search, which surfaces
 * explicit loading and no-results states. Keyboard: type to filter, ↑/↓ to move, Enter to pick,
 * Esc to close.
 */
export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = "Select…",
    searchPlaceholder = "Search…",
    onSearchChange,
    loading = false,
    emptyMessage = "No results",
    disabled,
    id,
    multiple,
  } = props;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();

  const selected = React.useMemo(
    () => (multiple ? new Set(props.value ?? []) : new Set(props.value ? [props.value] : [])),
    [multiple, props.value],
  );

  // Async mode (onSearchChange present) trusts the parent's options; otherwise filter locally.
  const visible = React.useMemo(() => {
    if (onSearchChange) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [onSearchChange, options, query]);

  React.useEffect(() => setActiveIndex(0), [query, open]);

  const selectAt = (index: number) => {
    const option = visible[index];
    if (!option || option.disabled) return;
    if (multiple) {
      const next = new Set(props.value ?? []);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      props.onValueChange?.([...next]);
    } else {
      props.onValueChange?.(option.value);
      setOpen(false);
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    onSearchChange?.(value);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectAt(activeIndex);
    }
  };

  const triggerLabel = (() => {
    if (multiple) {
      const count = selected.size;
      return count === 0 ? placeholder : `${count} selected`;
    }
    const current = options.find((o) => o.value === props.value);
    return current?.label ?? placeholder;
  })();

  const showEmpty = !loading && visible.length === 0;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        id={id}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-invalid={props["aria-invalid"]}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        className={cn(controlSurface, "justify-between gap-2 text-left")}
        style={controlSizing}
      >
        <span className={cn("truncate", selected.size === 0 && "text-text-muted")}>
          {triggerLabel}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-text-muted" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border border-border bg-bg-surface-raised text-text-primary shadow-lg"
          style={{ zIndex: "var(--z-command)" }}
          onOpenAutoFocus={(e) => {
            // Focus the search field, not the first option.
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={
                visible[activeIndex] ? `${listId}-${activeIndex}` : undefined
              }
              className="w-full bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <ul id={listId} role="listbox" aria-multiselectable={multiple} className="max-h-64 overflow-auto p-1">
            {loading && (
              <li className="flex items-center gap-2 px-2 py-2 text-sm text-text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading…
              </li>
            )}
            {showEmpty && (
              <li className="px-2 py-2 text-sm text-text-muted">{emptyMessage}</li>
            )}
            {!loading &&
              visible.map((option, index) => {
                const isSelected = selected.has(option.value);
                return (
                  <li
                    key={option.value}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectAt(index)}
                    className={cn(
                      "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                      index === activeIndex && "bg-accent-subtle",
                      option.disabled && "pointer-events-none opacity-50",
                    )}
                  >
                    <Check
                      className={cn("size-4 shrink-0 text-accent-text", !isSelected && "invisible")}
                      aria-hidden
                    />
                    <span className="truncate">{option.label}</span>
                  </li>
                );
              })}
          </ul>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
