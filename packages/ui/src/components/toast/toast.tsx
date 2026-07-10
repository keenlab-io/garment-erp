import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { Info, CheckCircle2, AlertTriangle, XCircle, Loader2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn.js";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** A single inline action, e.g. "Download" on a finished export. */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss delay in ms. Omit for the default; job toasts stay until resolved. */
  duration?: number;
}

/** Returned by `jobToast` so a long-running job can resolve its "Generating…" toast in place. */
export interface JobToastHandle {
  /** Swap the pending toast for its completion state (message, tone, result action). */
  resolve: (options: ToastOptions) => void;
  dismiss: () => void;
}

export interface ToastApi {
  /** Show a transient toast. Returns its id. */
  toast: (options: ToastOptions) => string;
  /** Show a persistent "working…" toast for an async job; resolve it when the job finishes. */
  jobToast: (options: ToastOptions) => JobToastHandle;
  dismiss: (id: string) => void;
}

interface ToastRecord extends ToastOptions {
  id: string;
  open: boolean;
  /** Pending job — renders a spinner and stays until resolved. */
  pending: boolean;
}

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const TONE_ACCENT: Record<ToastTone, string> = {
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

// A long, finite duration for persistent job toasts (Radix schedules on a real timer).
const PERSISTENT = 1000 * 60 * 60;

const ToastContext = React.createContext<ToastApi | null>(null);

/** Access the toast API. Must be rendered under `ToastProvider`. */
export function useToast(): ToastApi {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within a <ToastProvider>");
  return api;
}

export interface ToastProviderProps {
  children: React.ReactNode;
  /** Default auto-dismiss for transient toasts (ms). */
  duration?: number;
}

/**
 * Hosts the toast region at the shell level (`--z-toast`) and exposes the imperative `useToast` API.
 * Transient toasts auto-dismiss; `jobToast` shows a persistent "Generating…" toast that a background
 * job resolves into a completion notification with a result action.
 */
export function ToastProvider({ children, duration = 4000 }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const counter = React.useRef(0);

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback((options: ToastOptions, pending: boolean) => {
    const id = `toast-${counter.current++}`;
    setToasts((prev) => [...prev, { ...options, id, open: true, pending }]);
    return id;
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: (options) => push(options, false),
      jobToast: (options) => {
        const id = push(options, true);
        return {
          resolve: (next) =>
            setToasts((prev) =>
              prev.map((t) => (t.id === id ? { ...t, pending: false, ...next } : t)),
            ),
          dismiss: () => remove(id),
        };
      },
      dismiss: remove,
    }),
    [push, remove],
  );

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider>
        {children}
        {toasts.map((record) => (
          <ToastItem
            key={record.id}
            record={record}
            defaultDuration={duration}
            onDismiss={() => remove(record.id)}
          />
        ))}
        <ToastPrimitive.Viewport
          className="fixed bottom-0 right-0 flex w-[24rem] max-w-[100vw] flex-col gap-2 p-4 outline-none"
          style={{ zIndex: "var(--z-toast)" }}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastItem({
  record,
  defaultDuration,
  onDismiss,
}: {
  record: ToastRecord;
  defaultDuration: number;
  onDismiss: () => void;
}) {
  const tone = record.tone ?? "info";
  const ToneIcon = TONE_ICON[tone];

  return (
    <ToastPrimitive.Root
      open={record.open}
      duration={record.pending ? PERSISTENT : (record.duration ?? defaultDuration)}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      className="flex items-start gap-3 rounded-md border border-border bg-bg-surface-raised p-3 shadow-lg"
    >
      <span className={cn("mt-0.5 shrink-0", record.pending ? "text-text-muted" : TONE_ACCENT[tone])}>
        {record.pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <ToneIcon className="size-5" aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {record.title && (
          <ToastPrimitive.Title className="text-sm font-medium text-text-primary">
            {record.title}
          </ToastPrimitive.Title>
        )}
        {record.description && (
          <ToastPrimitive.Description className="text-caption text-text-secondary">
            {record.description}
          </ToastPrimitive.Description>
        )}
      </div>
      {record.action && (
        <ToastPrimitive.Action
          altText={record.action.label}
          onClick={record.action.onClick}
          className="shrink-0 self-center rounded-sm px-2 py-1 text-sm font-medium text-accent-text hover:bg-accent-subtle"
        >
          {record.action.label}
        </ToastPrimitive.Action>
      )}
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="shrink-0 rounded-sm text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <X className="size-4" aria-hidden />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
