import type { JobsOptions } from "bullmq";

/** Named queues (M0 plan §4). Workers subscribe by name. */
export const QUEUES = {
  email: "email",
  line: "line",
  pdf: "pdf",
  mvRefresh: "mv-refresh",
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
