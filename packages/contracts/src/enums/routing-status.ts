// Routing / work-order status state machine (spec §5.2).
export const RoutingStatus = {
  Pending: "Pending",
  InProgress: "InProgress",
  Completed: "Completed",
  Delayed: "Delayed",
} as const;
export type RoutingStatus = (typeof RoutingStatus)[keyof typeof RoutingStatus];
