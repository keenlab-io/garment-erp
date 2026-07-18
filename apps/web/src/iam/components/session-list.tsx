import * as React from "react";
import { Badge, Button, cn } from "@erp/ui";

export interface SessionRow {
  id: string;
  device?: string | null;
  ipAddress?: string | null;
  /** ISO datetime the session started. */
  createdAt: string;
  /** ISO datetime of the session's last activity. */
  lastActiveAt: string;
  /** The session serving the current viewer — its revoke action is disabled. */
  current?: boolean;
}

export interface SessionListLabels {
  deviceColumn: string;
  ipColumn: string;
  lastActiveColumn: string;
  current: string;
  revoke: string;
  empty: string;
}

const defaultLabels: SessionListLabels = {
  deviceColumn: "Device",
  ipColumn: "IP address",
  lastActiveColumn: "Last active",
  current: "Current",
  revoke: "Revoke",
  empty: "No active sessions.",
};

export interface SessionListProps {
  sessions: SessionRow[];
  /** Called with the row's session when its revoke action is clicked. The parent owns the guarded
   * confirmation flow (there is no per-session revoke endpoint yet — it force-logs-out the account). */
  onRevoke: (session: SessionRow) => void;
  /** Formats an ISO datetime for display; defaults to `toLocaleString`. */
  formatDateTime?: (iso: string) => string;
  labels?: Partial<SessionListLabels>;
  className?: string;
}

const defaultFormatDateTime = (iso: string) => new Date(iso).toLocaleString();

/**
 * A user's active-session list (M1 §3.4) — each row shows device/IP/last-active and a revoke action;
 * the current session's revoke is disabled. Presentational: the users-admin screen (M1 §4.2) supplies
 * `sessions` and wires the guarded confirmation around `onRevoke`.
 */
export function SessionList({
  sessions,
  onRevoke,
  formatDateTime = defaultFormatDateTime,
  labels: labelsProp,
  className,
}: SessionListProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  if (sessions.length === 0) {
    return <p className={cn("text-sm text-text-muted", className)}>{labels.empty}</p>;
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-bg-sunken">
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.deviceColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.ipColumn}
            </th>
            <th scope="col" className="px-3 py-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              {labels.lastActiveColumn}
            </th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">{labels.revoke}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 text-text-primary">
                <div className="flex items-center gap-2">
                  {session.device ?? "—"}
                  {session.current && <Badge tone="accent">{labels.current}</Badge>}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-mono text-text-secondary">
                {session.ipAddress ?? "—"}
              </td>
              <td className="px-3 py-2 text-text-secondary">{formatDateTime(session.lastActiveAt)}</td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="secondary"
                  onClick={() => onRevoke(session)}
                  disabled={session.current}
                >
                  {labels.revoke}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
