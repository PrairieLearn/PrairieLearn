/** Largest delay supported without Node.js shortening the timer. */
export const MAX_TIMER_DELAY_MILLISECONDS = 2_147_483_647;

interface BackoffOptions {
  type: 'fixed' | 'exponential';
  /** Base delay in milliseconds between attempts. */
  delay: number;
  /** Randomly reduces each retry delay by up to this fraction, between 0 and 1. */
  jitter?: number;
}

export interface JobOptions {
  /**
   * A custom job id. If a job with this id already exists, the add is ignored
   * and the existing job is returned. Custom ids share a namespace with the
   * auto-generated numeric ids, so purely numeric custom ids are not allowed.
   */
  jobId?: string;
  /**
   * Milliseconds to wait before the job can be processed. Jobs with the same
   * due time become eligible in the order they were scheduled.
   */
  delay?: number;
  /**
   * Priority within the job's group, from 0 to 2097152. Zero (the default)
   * runs first, followed by positive priorities in ascending order. Equal
   * priorities run in FIFO order; groups still take turns round-robin.
   */
  priority?: number;
  /**
   * Number of processor executions allowed after reported processor failures.
   * Stalled recovery is governed by {@link WorkerOptions.maxStalledCount} and
   * may cause additional executions. Defaults to 1.
   */
  attempts?: number;
  /** Retry delay in milliseconds. Exponential growth saturates at the largest safe integer. */
  backoff?: BackoffOptions;
  /** The group this job belongs to. Jobs without a group share a default group. */
  group?: { id: string };
  /** Suppresses another job with the same ID until its deduplication key is removed. */
  deduplication?: { id: string };
  /**
   * Whether to remove the job data once it completes. `true` removes it
   * immediately; a number keeps only that many of the most recent completed
   * jobs. Defaults to keeping all completed jobs.
   */
  removeOnComplete?: boolean | number;
  /** Like {@link JobOptions.removeOnComplete}, but for failed jobs. */
  removeOnFail?: boolean | number;
}

/** Options accepted by the state-aware deduplicated add helpers. */
export type DeduplicatedJobOptions = Omit<JobOptions, 'jobId' | 'deduplication'> & {
  jobId?: never;
  deduplication?: never;
};

/** Options accepted by recurring job scheduler templates. */
export type ScheduledJobOptions = Omit<JobOptions, 'jobId' | 'delay' | 'deduplication'> & {
  jobId?: never;
  delay?: never;
  deduplication?: never;
};

/** Job options that may be applied to every job added to a queue. */
export type DefaultJobOptions = Omit<JobOptions, 'jobId' | 'deduplication'> & {
  /** Custom job ids must be supplied for each individual job. */
  jobId?: undefined;
  /** A shared deduplication id would collapse every added job into one. */
  deduplication?: undefined;
};

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
  /** A `redis://` or `rediss://` URL with a hostname and optional numeric database path. */
  redisUrl: string;
  /** Non-empty, brace-free prefix for all Redis keys used by the queue. Defaults to `prairiemq`. */
  prefix?: string;
  /** Options other than `jobId` applied to every added job unless overridden per job. */
  defaultJobOptions?: DefaultJobOptions;
}

export interface RateLimiterOptions {
  max: number;
  duration: number;
}

export interface WorkerOptions {
  /** A `redis://` or `rediss://` URL with a hostname and optional numeric database path. */
  redisUrl: string;
  /** Must match the prefix used by the corresponding {@link QueueOptions.prefix}. */
  prefix?: string;
  /** Maximum number of jobs this worker processes concurrently. Defaults to 1; maximum 1000. */
  concurrency?: number;
  /**
   * Initial queue-wide maximum claims per fixed window, in milliseconds.
   * The window starts with its first claim. An existing shared policy takes
   * precedence; use Queue.setRateLimit to update it for every worker.
   */
  limiter?: RateLimiterOptions;
  /**
   * Maximum number of jobs of a single group that may be active at once
   * across all workers. 0 (the default) means unlimited. All workers of a
   * queue should use the same value.
   */
  groupConcurrency?: number;
  /**
   * How long (in milliseconds) an active job is considered locked by its
   * worker. Locks are renewed automatically while the job is processing;
   * jobs whose locks expire are considered stalled. Must be at least 30000;
   * defaults to 30000.
   */
  lockDuration?: number;
  /**
   * Maximum cumulative number of stalls permitted for a job while it is active
   * under this worker. The value is recorded with each claim, so a later
   * claimant may supply a different limit. Defaults to 1.
   */
  maxStalledCount?: number;
  /**
   * How often to check for jobs whose locks have expired. Defaults to 30000
   * milliseconds and must fit in a Node.js timer.
   */
  stalledInterval?: number;
  /** Whether to start processing immediately. Defaults to true. */
  autorun?: boolean;
}
