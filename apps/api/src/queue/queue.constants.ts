import type { JobsOptions } from "bullmq";

/** Named queues (M0 plan §4). Workers subscribe by name. */
export const QUEUES = {
  email: "email",
  line: "line",
  pdf: "pdf",
  mvRefresh: "mv-refresh",
  // Payroll (M2): async run calculation, statutory exports, and the daily probation scan.
  payroll: "payroll",
  // Reporting (M6): async report exports and scheduled/one-off digest renders. Its own
  // queue so its worker never competes with the `pdf`/`default` workers for jobs.
  report: "report",
  // Tenant control plane (M8 design D9): the PDPA export and the purge. Its own queue with one
  // dispatcher worker, so nothing else competes for these jobs.
  tenant: "tenant",
  default: "default",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** All registered queue names, for `BullModule.registerQueue`. */
export const QUEUE_NAMES: QueueName[] = Object.values(QUEUES);

/**
 * Default job options: 5 attempts with exponential backoff; keep the last 1000
 * completed jobs; keep failed jobs (dead-letter) for inspection.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};
