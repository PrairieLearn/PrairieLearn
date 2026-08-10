export interface BackoffOptions {
  type: 'fixed' | 'exponential';
  /** Base delay in milliseconds between attempts. */
  delay: number;
}

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JobOptions {
  /**
   * A custom job id. If a job with this id already exists, the add is ignored
   * and the existing job is returned. Custom ids share a namespace with the
   * auto-generated numeric ids, so purely numeric custom ids are not allowed.
   */
  jobId?: string;
  /** Milliseconds to wait before the job can be processed. */
  delay?: number;
  /**
   * Job priority within its group. Lower values are processed first; jobs
   * with equal priority are processed in FIFO order. Defaults to 0.
   */
  priority?: number;
  /**
   * Number of processor executions allowed after reported processor failures.
   * Stalled recovery is governed by `maxStalledCount` and may cause additional
   * executions. Defaults to 1.
   */
  attempts?: number;
  /**
   * Delay between retries. A number is treated as a fixed delay in
   * milliseconds; `exponential` doubles the base delay after each attempt.
   */
  backoff?: number | BackoffOptions;
  /** The group this job belongs to. Jobs without a group share a default group. */
  group?: { id: string };
  /**
   * Whether to remove the job data once it completes. `true` removes it
   * immediately; a number keeps only that many of the most recent completed
   * jobs. Defaults to keeping all completed jobs.
   */
  removeOnComplete?: boolean | number;
  /** Like {@link JobOptions.removeOnComplete}, but for failed jobs. */
  removeOnFail?: boolean | number;
}

export type JobState = 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'unknown';

export interface JobCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface GroupStatus {
  /** The group id, or null for the default group. */
  id: string | null;
  waiting: number;
  active: number;
}

export interface QueueOptions {
  redisUrl: string;
  /** Prefix for all Redis keys used by the queue. Defaults to `prairiemq`. */
  prefix?: string;
  /** Options applied to every added job unless overridden per job. */
  defaultJobOptions?: JobOptions;
}

export interface WorkerOptions {
  redisUrl: string;
  /** Must match the prefix used by the corresponding {@link QueueOptions.prefix}. */
  prefix?: string;
  /** Maximum number of jobs this worker processes concurrently. Defaults to 1. */
  concurrency?: number;
  /**
   * Maximum number of jobs of a single group that may be active at once
   * across all workers. 0 (the default) means unlimited. All workers of a
   * queue should use the same value.
   */
  groupConcurrency?: number;
  /**
   * How long (in milliseconds) an active job is considered locked by its
   * worker. Locks are renewed automatically while the job is processing;
   * jobs whose locks expire are considered stalled. Defaults to 30000.
   */
  lockDuration?: number;
  /** How often (in milliseconds) to check for stalled jobs. Defaults to 30000. */
  stalledInterval?: number;
  /**
   * How many times a job may stall before it is moved to the failed state
   * instead of being requeued. Defaults to 1.
   */
  maxStalledCount?: number;
  /**
   * Upper bound (in milliseconds) on how long an idle worker waits for new
   * work before polling again. Defaults to 1000.
   */
  blockTimeout?: number;
  /** Whether to start processing immediately. Defaults to true. */
  autorun?: boolean;
}
