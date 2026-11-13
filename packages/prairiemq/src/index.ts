export { UnrecoverableError } from './errors.js';
export { createJob, type Job } from './job.js';
export {
  JobIdDeduplicationConflictError,
  Queue,
  type JobStatus,
  type QueueEvents,
} from './queue.js';
export { RedisCompatibilityError } from './scripts.js';
export { MAX_TIMER_DELAY_MILLISECONDS } from './types.js';
export type {
  DeduplicatedJobOptions,
  DefaultJobOptions,
  GroupStatus,
  JobCounts,
  JobOptions,
  JobState,
  QueueOptions,
  RateLimiterOptions,
  ScheduledJobOptions,
  WorkerOptions,
} from './types.js';
export { Worker, type Processor, type WorkerEvents } from './worker.js';
