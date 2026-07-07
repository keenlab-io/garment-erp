# Background Queue

## Purpose
Named BullMQ job queues on Redis with default retry/dead-letter options and a base worker for idempotent, logged processing.

## Requirements

### Requirement: Named job queues
The system SHALL provide named BullMQ queues for `email`, `line`, `pdf`, `mv-refresh`, and `default`, registered at application startup so producers can enqueue jobs by queue name.

#### Scenario: Enqueue to a named queue
- **WHEN** a producer enqueues a job on the `pdf` queue
- **THEN** the job is stored in Redis under the `pdf` queue and is picked up only by workers processing that queue

#### Scenario: All queues registered at boot
- **WHEN** the API application starts
- **THEN** the `email`, `line`, `pdf`, `mv-refresh`, and `default` queues are all registered and available for enqueueing

### Requirement: Default job options with retry and dead-letter retention
The system SHALL apply default job options to every queue: 5 attempts with exponential backoff, a bounded `removeOnComplete` limit, and `removeOnFail: false` so exhausted jobs are retained as a dead-letter set for inspection.

#### Scenario: Transient failure is retried with backoff
- **WHEN** a job handler throws an error on its first attempt
- **THEN** the job is retried with exponentially increasing delay, up to 5 total attempts

#### Scenario: Exhausted job is retained as dead-letter
- **WHEN** a job fails on all 5 attempts
- **THEN** the job remains in the failed set (it is not removed) and can be inspected and manually retried

#### Scenario: Completed jobs are pruned
- **WHEN** the number of completed jobs on a queue exceeds the configured `removeOnComplete` bound
- **THEN** the oldest completed jobs are removed so completed-job storage stays bounded

### Requirement: Base worker with logging and idempotent processing
The system SHALL provide a base worker class that wraps job handling with start/success/failure logging, and every worker implementation MUST be idempotent on `(event, correlation_id)` so a retried or duplicate job produces no additional effect beyond the first successful processing.

#### Scenario: Job processing is logged
- **WHEN** a worker processes a job
- **THEN** the worker logs the job start and its outcome (success or failure with the error)

#### Scenario: Duplicate job has no double effect
- **WHEN** a job carrying an `(event, correlation_id)` pair that was already processed successfully is delivered again (retry or duplicate enqueue)
- **THEN** the worker completes without repeating the side effect (no second email sent, no second file written)

### Requirement: Redis connection compatible with BullMQ
The Redis connection used by the queue subsystem MUST be configured with `maxRetriesPerRequest: null`, and the Redis URL MUST come from validated environment configuration.

#### Scenario: Connection options satisfy BullMQ
- **WHEN** the queue module creates its Redis connection
- **THEN** the connection is configured with `maxRetriesPerRequest: null` and BullMQ starts without rejecting the connection options

#### Scenario: Redis URL from environment
- **WHEN** the application boots with a `REDIS_URL` in the environment
- **THEN** the queue subsystem connects to that Redis instance; a missing or invalid `REDIS_URL` fails validation at boot
