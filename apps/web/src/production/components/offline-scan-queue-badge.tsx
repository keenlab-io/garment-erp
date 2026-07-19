import * as React from "react";
import { Badge, cn } from "@erp/ui";

export interface OfflineScanQueueBadgeLabels {
  offline: (count: number) => string;
  syncing: (count: number) => string;
  queued: (count: number) => string;
}

const defaultLabels: OfflineScanQueueBadgeLabels = {
  offline: (count) => `Offline — ${count} scan${count === 1 ? "" : "s"} queued`,
  syncing: (count) => `Syncing ${count}…`,
  queued: (count) => `${count} queued`,
};

export interface OfflineScanQueueBadgeProps {
  isOnline: boolean;
  queuedCount: number;
  syncing: boolean;
  labels?: Partial<OfflineScanQueueBadgeLabels>;
  className?: string;
}

/**
 * The kiosk's offline banner + sync badge (M4 §3.4, design MD3) — driven entirely by
 * `useOfflineScanQueue`'s state, so it's presentational and easy to place next to the scan field.
 * Renders nothing once online with an empty, non-syncing queue (the common, uneventful state).
 */
export function OfflineScanQueueBadge({
  isOnline,
  queuedCount,
  syncing,
  labels: labelsProp,
  className,
}: OfflineScanQueueBadgeProps) {
  const labels = { ...defaultLabels, ...labelsProp };

  if (!isOnline) {
    return (
      <Badge tone="danger" role="status" className={cn(className)}>
        {labels.offline(queuedCount)}
      </Badge>
    );
  }
  if (syncing) {
    return (
      <Badge tone="info" role="status" className={cn(className)}>
        {labels.syncing(queuedCount)}
      </Badge>
    );
  }
  if (queuedCount > 0) {
    return (
      <Badge tone="warning" role="status" className={cn(className)}>
        {labels.queued(queuedCount)}
      </Badge>
    );
  }
  return null;
}
