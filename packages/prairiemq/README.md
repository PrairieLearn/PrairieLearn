# `@prairielearn/prairiemq`

PrairieMQ is a Redis-backed job queue modeled on BullMQ Pro's `Queue`. It supports job groups with round-robin fairness and per-group concurrency limits, priorities, delayed jobs, retries with backoff, and stalled-job recovery. All state transitions are performed atomically with Lua scripts, so multiple workers (including workers in different processes) can safely consume from the same queue.

## Usage

Create a `Queue` to add jobs and a `Worker` to process them. Both connect to Redis with a URL, matching how the rest of the codebase configures Redis (e.g. `config.redisUrl`):

```ts
import { Queue, Worker } from '@prairielearn/prairiemq';

const queue = new Queue('emails', {
  redisUrl: 'redis://localhost:6379/',
  // Bound storage while leaving enough history for a status page.
  defaultJobOptions: { removeOnComplete: 10_000, removeOnFail: 10_000 },
});

await queue.add('send-welcome', { to: 'student@example.com' });

const worker = new Worker(
  'emails',
  async (job) => {
    await sendEmail(job.data);
    return 'sent';
  },
  { redisUrl: 'redis://localhost:6379/', concurrency: 4 },
);

worker.on('completed', (job, result) => console.log(`job ${job.id} finished: ${result}`));
worker.on('failed', (job, err) => console.error(`job ${job.id} failed: ${err.message}`));

await worker.waitUntilReady();
```

### Groups

Jobs can be assigned to a group. Workers serve groups in round-robin order, so a burst of jobs in one group cannot starve the others — the headline feature of BullMQ Pro's queues. Jobs without a group share a single default group.

```ts
// These are interleaved: course-1, course-2, course-1, course-2, ...
await queue.add('regrade', { assessmentId: 1 }, { group: { id: 'course-1' } });
await queue.add('regrade', { assessmentId: 2 }, { group: { id: 'course-1' } });
await queue.add('regrade', { assessmentId: 3 }, { group: { id: 'course-2' } });
await queue.add('regrade', { assessmentId: 4 }, { group: { id: 'course-2' } });
```

A worker can also cap how many jobs of a single group may be active at once across all workers:

```ts
const worker = new Worker('regrades', processRegrade, {
  redisUrl,
  concurrency: 8,
  // At most 2 active jobs per course, even though the worker runs 8 jobs at a time.
  groupConcurrency: 2,
});
```

The first worker persists the queue's `groupConcurrency` value in Redis. Later workers must use the same value or `waitUntilReady()` will reject. The setting lasts for the lifetime of the queue and is removed by `obliterate()`.

### Job options

```ts
await queue.add('name', data, {
  delay: 5000, // Wait 5 seconds before the job can run.
  priority: 10, // Lower runs first within a group; default 0.
  attempts: 3, // Retry up to 2 times after the first failure.
  backoff: { type: 'exponential', delay: 1000 }, // 1s, then 2s between retries.
  group: { id: 'course-1' },
  jobId: 'regrade-assessment-42', // Adding the same id twice is a no-op; numeric ids are reserved.
  removeOnComplete: 1000, // Keep only the 1000 most recent completed jobs.
  removeOnFail: false, // Keep all failed jobs (the default).
});
```

Options can also be set for all jobs of a queue with `defaultJobOptions` in the `Queue` constructor.

Job data and processor return values must contain only JSON values. Plain objects, arrays, strings, finite numbers, booleans, and `null` are supported; values such as `bigint`, `Date`, `Map`, functions, and circular references are rejected.

### Queue introspection and management

```ts
await queue.getJob(jobId); // Job | null
await queue.getJobState(jobId); // 'waiting' | 'active' | 'delayed' | 'completed' | 'failed' | 'unknown'
await queue.getJobStatus(jobId); // { state, job }, read atomically for efficient polling
await queue.getJobCounts(); // { waiting, active, delayed, completed, failed }
await queue.getGroups(); // [{ id, waiting, active }, ...]

await queue.pause(); // Stop handing out jobs (adding still works).
await queue.resume();
await queue.drain(); // Remove all waiting jobs; drain(true) also removes delayed jobs.
await queue.obliterate(); // Delete all queue data. Close workers first.
await queue.close();
```

### Worker events

Worker events are local to the process that executes the job. A web process that needs to observe work performed by any worker should poll `getJobStatus()`; PrairieMQ does not currently provide a cross-process `QueueEvents` or `waitUntilFinished()` primitive.

- `completed (job, result)`: a job finished successfully.
- `failed (job, error)`: a job failed with no attempts remaining.
- `retrying (job, error)`: a job failed and was requeued for another attempt.
- `stalled (jobId)`: a job's lock expired (e.g. its worker crashed); it was requeued, or moved to failed once it stalled more than `maxStalledCount` times.
- `error (error)`: an operational error (e.g. a Redis hiccup). Unlike a plain `EventEmitter`, a missing `error` listener will not crash the process.

### Delivery semantics

PrairieMQ provides at-least-once delivery. A worker holds a renewing lock (`lockDuration`, default 30s) while processing a job; if the worker dies, another worker's stalled-job check (`stalledInterval`, default 30s) requeues the job. Stalled recovery is limited separately by `maxStalledCount`, so it can cause more processor executions than the job's `attempts` setting. Processors should therefore be idempotent.

Workers wake up immediately when jobs are added (via a Redis wake-up marker) and otherwise poll at `blockTimeout` intervals (default 1s), which bounds the latency of delayed-job promotion and of picking up work freed by other workers' group-concurrency limits.

Redis Cluster is not supported; keys are derived from a single prefix (`<prefix>:<queueName>:...`, prefix defaults to `prairiemq`).

## Testing

The tests require a running Redis server (`make start-support` from the repository root), and use a unique key prefix per test so they can run against a shared instance:

```sh
pnpm test
```
