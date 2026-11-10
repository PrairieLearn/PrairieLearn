# `@prairielearn/prairiemq`

PrairieMQ is a Redis-backed job queue for workloads that need fair scheduling across groups. It supports per-group concurrency limits, delayed jobs, retries with fixed or exponential backoff, and recovery when a worker disappears.

## Requirements

- Node.js 24 or later.
- Redis 6.2 or later.
- A non-clustered Redis deployment. Redis Cluster is not supported.
- Redis credentials that permit `INFO`, `TIME`, `SELECT` when using a nonzero database, `EVAL`/`EVALSHA`, `BLPOP`, `SCAN`, `UNLINK`, `MULTI`/`EXEC`, and the keyspace (`DEL`, `EXISTS`, and `PEXPIRE`), string, list, set, sorted-set, and hash commands PrairieMQ uses on its queue keys.

## Basic usage

Create a `Queue` to add jobs and a `Worker` to process them:

```ts
import { Queue, Worker } from '@prairielearn/prairiemq';

interface EmailData {
  to: string;
}

const queue = new Queue<EmailData, 'sent'>('emails', {
  redisUrl: 'redis://localhost:6379/',
});
queue.on('error', reportError);

await queue.add(
  'send-welcome',
  { to: 'student@example.com' },
  { jobId: 'send-welcome-student-123' },
);

const worker = new Worker<EmailData, 'sent'>(
  'emails',
  async (job) => {
    await sendEmail(job.data);
    return 'sent';
  },
  { redisUrl: 'redis://localhost:6379/', concurrency: 4 },
);

worker.on('failed', (job, err) => console.error(`job ${job.id} failed: ${err.message}`));
worker.on('error', reportError);
await worker.waitUntilReady();

// During shutdown:
await worker.close();
await queue.close();
```

Redis connections must use a `redis://` or `rediss://` URL with a hostname and an optional numeric database path. Query parameters and fragments are not supported. Queue names may contain letters, numbers, underscores, periods, and hyphens. Every `Queue` and `Worker` for the same logical queue must use the same name and non-empty Redis key `prefix` (which defaults to `prairiemq`); prefixes cannot contain `{` or `}`.

## Groups and concurrency

Ready jobs in each group start in priority order, with FIFO ordering within a priority, while workers rotate between groups. Jobs with no priority (or priority `0`) run before jobs with a positive priority; lower positive values run first. A delayed job becomes ready when its delay expires; jobs with the same due time preserve the order they were scheduled. Delays, retry backoffs, and scheduler intervals use Redis server time, so application-host clock differences do not change when work becomes eligible. Jobs without a group share one default group.

```ts
await queue.add('regrade', data, { group: { id: 'course-1' } });
await queue.add('regrade', data, { group: { id: 'course-2' } });
```

Worker `concurrency` limits the number of jobs handled by one worker. `groupConcurrency` limits active jobs in each group across all workers:

```ts
const worker = new Worker('regrades', processRegrade, {
  redisUrl,
  concurrency: 8,
  groupConcurrency: 2,
});
```

The first worker stores the queue's `groupConcurrency` setting in Redis. All later workers must use the same value. The default is `0`, which means unlimited. Fairness controls the order in which jobs start, not when they finish.

## Job options

```ts
await queue.add('name', data, {
  delay: 5000,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.2 },
  priority: 2,
  group: { id: 'course-1' },
  deduplication: { id: 'course-1-regrade' },
  jobId: 'regrade-assessment-42',
  removeOnComplete: 1000,
  removeOnFail: 1000,
});
```

`defaultJobOptions` sets queue-wide defaults, which per-job options can override. Custom `jobId` values must be supplied to each `add()` call or `addBulk()` entry and cannot be configured as a default. `attempts` includes the first execution, so `3` allows two retries.

Custom job IDs prevent duplicates while the existing job is retained. Adding an existing ID returns the original job and ignores the new values. Use stable IDs if an application might retry an `add()` call after a Redis error. When a custom-ID job is later added with a deduplication ID, it atomically adopts that ID without rewriting its original data or options. A job that already owns a different deduplication ID raises `JobIdDeduplicationConflictError`; if the requested deduplication ID already maps to another live job, that mapped job is returned instead.

Job data and results must contain only JSON values. An `undefined` processor result is stored as `null`; an invalid result makes the job fail without another retry. `addBulk()` validates and adds up to 1000 jobs in one atomic operation.

By default, completed and failed jobs remain in Redis. `removeOnComplete` and `removeOnFail` can remove them immediately (`true`) or keep only the most recent number of jobs. Large numeric-retention cleanups are recorded durably and continued by a running or restarted worker in fixed-size batches, even if no more jobs finish. Counts can briefly exceed the requested history size while that cleanup is pending.

`priority` is an integer from `0` through `2,097,152`. Priority applies within a group; it does not bypass the round-robin scheduling between groups. For example, an email queue can use the default group to prioritize password-reset emails over digest emails.

Fixed backoff repeats the configured delay. Exponential backoff doubles it after each failure, starting with the configured delay after the first failure. Retry delays are stored as Redis timestamps, so they can exceed the Node.js timer range. Exponential growth and due timestamps saturate at the largest exactly representable integer (`Number.MAX_SAFE_INTEGER`). Optional `jitter` ranges from `0` to `1` and randomizes the delay between `(1 - jitter)` times the calculated delay and the full delay. Throw `UnrecoverableError` from `@prairielearn/prairiemq` to stop retrying a permanent failure immediately. Import it from the package root alongside `Worker` so both use the same error class.

### Rate limiting

Set `limiter: { max: 5, duration: 1000 }` on every worker to allow at most five job starts per one-second Redis window across all workers of a queue. This limits starts, independently of the number of active jobs. Retries and jobs restarted after a worker stalls count toward the limit when they start again. The worker option initializes the shared policy when it does not exist. Use `queue.setRateLimit({ max, duration })` to change it without losing queued work, or `queue.setRateLimit(null)` to disable it. Every worker follows the shared policy, including workers without a local limiter option. Updating the policy preserves the current window and its count: a changed maximum applies immediately and a changed duration applies to the next window.

### Deduplication

A deduplication ID suppresses later additions while its key points at an existing job. Adding a duplicate returns the existing job. The key is removed automatically when retention removes that job's data, or it can be removed explicitly to allow another job while the original is still active:

```ts
const job = await queue.add('regrade', data, {
  deduplication: { id: `regrade-${assessmentId}` },
});

await queue.getDeduplicationJobId(`regrade-${assessmentId}`); // job.id
await queue.removeDeduplicationKey(`regrade-${assessmentId}`);
```

Automatic retention cleanup for an old job cannot delete a newer mapping for the same deduplication ID.

`addDeduplicatedUntilActive()` atomically reuses a waiting or delayed job, but creates and returns one follow-up job when the mapped job has already started. This is useful when changes made during an active run must trigger one more pass without accumulating duplicate waiting work.

`addDeduplicatedUntilFinished()` also reuses active work, but replaces a completed or failed mapping. Both methods return the job that was actually selected, which may contain data from an earlier caller.

These state-aware helpers take the deduplication ID as their dedicated argument; their options do not accept `jobId` or another `deduplication` value.

### Recurring jobs

`upsertJobScheduler()` persistently schedules a job at a fixed interval:

```ts
await queue.upsertJobScheduler(
  'refresh-metrics',
  { every: 60_000 },
  { name: 'refresh-metrics', data: { scope: 'all' } },
);
```

Registering an unchanged scheduler again preserves its next run, so every application host may safely call `upsertJobScheduler()` during startup. A running worker atomically promotes due schedules. Missed intervals are coalesced into one job instead of producing a catch-up burst. Scheduled templates inherit `defaultJobOptions`, but cannot specify `jobId`, `delay`, or `deduplication`.

Scheduler template `data` is required. Use `getJobSchedulerIds()` to reconcile the configured scheduler set and `removeJobScheduler(id)` to atomically remove a scheduler. Each occurrence receives an auto-generated job ID, so an application-created custom ID cannot suppress it. Recurring jobs run indefinitely; give their templates bounded `removeOnComplete` and `removeOnFail` settings to avoid accumulating history.

## Production readiness

PrairieMQ's at-least-once delivery semantics assume that Redis retains acknowledged queue writes. Redis replication is asynchronous, and persistence depends on the deployment configuration, so a primary failure can lose a recently acknowledged enqueue. Configure Redis persistence and failover for the required durability. Applications that cannot tolerate a lost job must also keep the intended work in a durable source of truth and reconcile or re-enqueue it.

PrairieMQ assumes that Redis will not evict queue keys. Configure the Redis instance with `maxmemory-policy noeviction`. Removing only some of a queue's keys can make its state inconsistent. With `noeviction`, Redis rejects writes when it runs out of memory instead, so monitor memory usage and provision enough capacity for queued and retained jobs.

Completed and failed jobs are retained without a limit when `removeOnComplete` or `removeOnFail` is unset or `false`. Do not use unbounded retention in production. Set queue-wide `defaultJobOptions` so completed jobs are removed immediately or kept only for a bounded history, and do the same for failed jobs with a limit large enough for operational debugging:

```ts
const queue = new Queue('emails', {
  redisUrl,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});
```

## Status and queue management

```ts
await queue.getJobStatus(jobId); // { state, job }
await queue.getJobCounts(); // { waiting, active, delayed, completed, failed }
await queue.getGroups(); // [{ id, waiting, active }, ...]
await queue.getJobSchedulerIds();
await queue.removeJobScheduler(schedulerId);

await queue.pause(); // Active jobs continue; new jobs can still be added.
await queue.resume();
await queue.obliterate(); // Delete all queue data after closing its workers.
```

A removed or missing job has the state `unknown`. `getGroups()` returns groups that have waiting or active jobs. Pausing affects every worker connected to the queue.

Worker events are local to the process running that worker:

- `failed (job, error)`: the job ran out of attempts, threw `UnrecoverableError`, or returned a result that could not be stored.
- `stalled (jobId, failed)`: the job lost its lock and was either requeued or failed.
- `error (error)`: Redis or lock-related errors. Always attach an `error` listener.

To observe jobs handled by another process, poll `getJobStatus()`. Failure errors are not saved with the job. PrairieMQ does not provide cross-process events or a wait-for-completion method.

## Worker lifecycle and reliability

Workers start automatically. Set `autorun: false` to attach listeners before calling `run()`. `waitUntilReady()` confirms that the worker has connected and successfully checked the queue. Permanent credential, permission, database, version, and unsupported-cluster errors emit `error`, close the worker, and reject readiness; transient connection and Redis availability errors are retried.

`preflight()` is available before `run()` when a deployment must prove a worker is usable without taking work. It verifies both Redis connections, the configured database and Redis version, group-concurrency compatibility, a non-claiming fetch, and the blocking command used to wait for work. After it resolves, call `run()` normally.

`close()` stops taking new work and waits for active jobs to finish. `close(true)` disconnects immediately, leaving another worker to recover abandoned jobs after their locks expire.

The main worker options are:

- `concurrency`: jobs handled by this worker; defaults to 1 and has a maximum of 1000.
- `groupConcurrency`: active jobs per group across all workers; defaults to unlimited.
- `lockDuration`: time before an unrenewed job can be treated as stalled; its minimum and default are 30 seconds.
- `maxStalledCount`: cumulative stalled-recovery limit applied to jobs claimed by this worker; it is recorded with each active claim and defaults to 1.
- `stalledInterval`: how often to check for expired locks; defaults to 30 seconds and must be a positive integer in milliseconds no larger than `2147483647`.
- `autorun`: whether processing starts immediately; defaults to `true`.

Within the Redis durability boundary described above, PrairieMQ provides at-least-once delivery. Workers renew a lock while processing each job; if a worker stops renewing it, another worker can requeue the job. This recovery is separate from normal retry attempts, so processors must be safe to run more than once.

Workers wake when jobs are added and also check once per second, so a delayed job may start up to about one second after it is due.

The wait for a wake-up marker uses Redis's polling timeout. A separate 10-second command deadline detects an unresponsive connection; a short poll does not shorten that deadline. If the command fails, the worker closes the socket that sent it before retrying, so an abandoned wait cannot consume later wake-up markers. Ordinary late replies do not trigger reconnection.

All PrairieMQ connections also use a 10-second socket timeout while awaiting replies. Command deadlines alone leave unanswered commands and their payloads retained in the client's reply queue. The socket timeout closes a connection that stops delivering data, allowing reconnection to release those commands. Automatic replay remains disabled because a mutating command may have succeeded even when its reply was lost.

## Design and limits

Each group has a FIFO waiting list for unprioritized jobs and a sorted waiting set for positive priorities. Workers rotate through groups when starting jobs. A companion Redis set tracks which groups are in the rotation without scanning the rotation list. Redis also stores active, delayed, completed, and failed jobs, along with locks and per-group active counts.

PrairieMQ uses Lua scripts so multi-step job changes happen as a single operation. Workers coordinate through Redis, so they can safely run in different processes or on different hosts. Worker fetches use sequenced, idempotent Redis requests so a command whose reply is lost cannot claim additional jobs when it is retried. An expiring per-queue lease ensures only one worker scans active jobs for expired locks during each stalled-check interval.

A PrairieMQ queue is one atomic Redis slot-affinity domain. Every Redis key touched by a queue operation is derived from that queue's tagged base. The tag contains both the prefix and queue name, so different queues do not deliberately share an affinity domain; PrairieMQ has no cross-queue atomic operations. Distinct tags can still map to the same one of Redis's 16,384 physical slots by ordinary hash collision. Groups remain scheduling subdivisions within one queue rather than independent shards. Future Redis Cluster support may distribute different queues across slots, but it will not split one logical queue across slots.

PrairieMQ still supports standalone Redis only. Tagged bases colocate a queue's keys, but do not add Cluster discovery, routing, retries, failover handling, or tests. The current Lua scripts dynamically construct key names from the tagged base supplied as `KEYS[1]`. Redis documents that scripts should receive [every accessed key explicitly through `KEYS`](https://redis.io/docs/latest/commands/eval/), so PrairieMQ's dynamic derivation is a portability constraint that future Cluster support must test and document.

PrairieMQ intentionally has a focused API. It does not currently support cron-pattern schedulers, progress tracking, Redis Cluster, cross-process events, or waiting directly for a job to finish.

## Testing

Start Redis with `make start-redis` from the repository root, then run:

```sh
pnpm --filter @prairielearn/prairiemq... build
pnpm --filter @prairielearn/prairiemq test
```

Use `createJob` to construct `Job` instances when unit testing processors without Redis. `MAX_TIMER_DELAY_MILLISECONDS` is the largest value accepted for timer-backed settings such as `stalledInterval` and `limiter.duration`.

The tests use unique queue names and remove only those queues’ keys. Set `REDIS_URL` to use another standalone Redis server or database. No PrairieLearn application server or PostgreSQL setup is needed.
