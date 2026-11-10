import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { Redis } from 'ioredis';

import { assertNever, withResolvers } from '@prairielearn/utils';

import { UnrecoverableError } from './errors.js';
import { type Job, createJob, jobFromRecord } from './job.js';
import { serializeJson } from './json.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { validateQueueName } from './queue.js';
import {
  type PrairieMQRedis,
  REDIS_COMMAND_TIMEOUT,
  RedisCompatibilityError,
  createScriptedClient,
  ensureSelectedDatabase,
} from './scripts.js';
import { type JobOptions, MAX_TIMER_DELAY_MILLISECONDS, type WorkerOptions } from './types.js';
import {
  normalizeRedisUrl,
  validateOptionsObject,
  validatePrefix,
  validateRateLimiter,
} from './validation.js';

const MAX_CONCURRENCY = 1000;
const MAX_GROUP_CONCURRENCY_MISMATCHES = 3;
const STALLED_INTERVAL = 30_000;
const BLOCK_TIMEOUT = 1000;
const FETCH_SESSION_HEARTBEAT = 60 * 60 * 1000;
const MINIMUM_LOCK_DURATION = REDIS_COMMAND_TIMEOUT * 3;
const WORKER_OPTION_NAMES = new Set<keyof WorkerOptions>([
  'redisUrl',
  'prefix',
  'concurrency',
  'limiter',
  'groupConcurrency',
  'lockDuration',
  'maxStalledCount',
  'stalledInterval',
  'autorun',
]);
const PERMANENT_REDIS_STARTUP_ERROR_CODES = new Set([
  'NOPERM',
  'NOAUTH',
  'WRONGPASS',
  'WRONGTYPE',
  'MOVED',
  'ASK',
  'CROSSSLOT',
]);

export type Processor<Data, Result> = (job: Job<Data, Result>) => Promise<Result>;

export interface WorkerEvents<Data, Result> {
  /** A job failed and has no attempts left. */
  failed: [job: Job<Data, Result>, error: Error];
  /** A job's lock expired; `failed` says whether it exhausted stalled recovery. */
  stalled: [jobId: string, failed: boolean];
  error: [error: Error];
}

class GroupConcurrencyMismatchError extends Error {}
class GroupConcurrencyConfigurationError extends Error {}

interface FetchSession {
  id: string;
  startedAt: number;
  nextSequence: number;
  pending: { sequence: number; token: string } | null;
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isPermanentRedisError(error: Error): boolean {
  if (error.name !== 'ReplyError') return false;
  const [code] = error.message.split(' ', 1);
  if (PERMANENT_REDIS_STARTUP_ERROR_CODES.has(code)) return true;
  return (
    /^ERR (?:unknown command|DB index is out of range|SELECT is not allowed)/i.test(
      error.message,
    ) ||
    /^ERR Script attempted to access a non local key/i.test(error.message) ||
    /^ERR Error running script\b.*(?:\bWRONGTYPE\b|(?:Lua )?script attempted to access a non local key\b)/i.test(
      error.message,
    ) ||
    /^ERR(?:\s|$).*?(?:ACL failure in script:|The user executing the script )/i.test(error.message)
  );
}

function isFatalStartupError(error: Error): boolean {
  return (
    error instanceof RedisCompatibilityError ||
    error instanceof GroupConcurrencyConfigurationError ||
    isPermanentRedisError(error)
  );
}

function encodeRemoveMode(value: boolean | number | undefined): number {
  if (value === true) return -1;
  if (typeof value === 'number' && value > 0) return Math.floor(value);
  return 0;
}

function computeBackoffDelay(options: JobOptions, failedAttempts: number): number {
  if (!options.backoff) return 0;
  const { type, delay, jitter = 0 } = options.backoff;
  let maximum: number;
  switch (type) {
    case 'fixed':
      maximum = delay;
      break;
    case 'exponential':
      maximum = delay === 0 ? 0 : Math.min(delay * 2 ** failedAttempts, Number.MAX_SAFE_INTEGER);
      break;
    default:
      return assertNever(type);
  }
  return jitter === 0 ? maximum : Math.floor(maximum * (1 - jitter + Math.random() * jitter));
}

function validateIntegerOption(
  name: string,
  value: unknown,
  minimum: number,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    const requirement = minimum === 0 ? 'a non-negative integer' : 'a positive integer';
    throw new Error(`${name} must be ${requirement}`);
  }
}

function validateWorkerOptions(options: unknown): string {
  const optionRecord = validateOptionsObject('Worker', options, WORKER_OPTION_NAMES);
  const redisUrl = normalizeRedisUrl(optionRecord.redisUrl);
  validatePrefix(optionRecord.prefix);

  if (optionRecord.limiter !== undefined) {
    validateRateLimiter(optionRecord.limiter);
  }
  if (optionRecord.concurrency !== undefined) {
    validateIntegerOption('concurrency', optionRecord.concurrency, 1);
    if (optionRecord.concurrency > MAX_CONCURRENCY) {
      throw new Error(`concurrency must not exceed ${MAX_CONCURRENCY}`);
    }
  }
  if (optionRecord.groupConcurrency !== undefined) {
    validateIntegerOption('groupConcurrency', optionRecord.groupConcurrency, 0);
  }
  if (optionRecord.lockDuration !== undefined) {
    validateIntegerOption('lockDuration', optionRecord.lockDuration, 1);
    if (optionRecord.lockDuration < MINIMUM_LOCK_DURATION) {
      throw new Error(`lockDuration must be at least ${MINIMUM_LOCK_DURATION}ms`);
    }
  }
  if (optionRecord.maxStalledCount !== undefined) {
    validateIntegerOption('maxStalledCount', optionRecord.maxStalledCount, 0);
  }
  if (optionRecord.stalledInterval !== undefined) {
    validateIntegerOption('stalledInterval', optionRecord.stalledInterval, 1);
    if (optionRecord.stalledInterval > MAX_TIMER_DELAY_MILLISECONDS) {
      throw new Error(`stalledInterval must not exceed ${MAX_TIMER_DELAY_MILLISECONDS}ms`);
    }
  }
  if (optionRecord.autorun !== undefined && typeof optionRecord.autorun !== 'boolean') {
    throw new Error('autorun must be a boolean');
  }
  return redisUrl;
}

function waitForRedisReady(clients: readonly Redis[], signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  if (clients.every((client) => client.status === 'ready')) return Promise.resolve();
  if (clients.some((client) => client.status === 'end')) {
    return Promise.reject(new Error('Redis connection has closed'));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      for (const client of clients) {
        client.off('ready', onReady);
        client.off('end', onEnd);
      }
      signal.removeEventListener('abort', onAbort);
    };
    const onReady = () => {
      if (!clients.every((client) => client.status === 'ready')) return;
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Redis connection closed before becoming ready'));
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };
    for (const client of clients) {
      client.on('ready', onReady);
      client.on('end', onEnd);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForCompletionOrAbort(
  promises: Promise<unknown>[],
  ...signals: AbortSignal[]
): Promise<void> {
  if (signals.some((signal) => signal.aborted)) return;

  const { promise: aborted, resolve } = withResolvers<undefined>();
  const onAbort = () => resolve(undefined);
  for (const signal of signals) signal.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([...promises, aborted]);
  } finally {
    // Reusing a shutdown promise here would retain every poll's race handlers
    // until shutdown, even after another promise won the race.
    for (const signal of signals) signal.removeEventListener('abort', onAbort);
  }
}

export class Worker<Data = unknown, Result = unknown> extends EventEmitter<
  WorkerEvents<Data, Result>
> {
  private readonly queueName: string;
  private readonly processor: Processor<Data, Result>;
  private readonly keys: QueueKeys;
  private readonly client: PrairieMQRedis;
  private readonly blockingClient: Redis;
  private readonly concurrency: number;
  private readonly limiter: WorkerOptions['limiter'];
  private readonly groupConcurrency: number;
  private readonly lockDuration: number;
  private readonly stalledInterval: number;
  private readonly maxStalledCount: number;

  private readonly processing = new Set<Promise<void>>();
  private readonly activeTokens = new Map<string, string>();
  private readonly finalizingTokens = new Set<string>();
  private readonly lostLockTokens = new Set<string>();
  private closing = false;
  private forceClosing = false;
  private closed = false;
  private runPromise: Promise<void> | null = null;
  private preflightPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private markerWait: Promise<void> | null = null;
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private lockRenewalPromise: Promise<void> | null = null;
  private stalledTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;
  private fatalError: Error | null = null;
  private groupConcurrencyConfigured = false;
  private blockingConnectionGeneration = 0;
  private verifiedBlockingConnectionGeneration = -1;
  private fetchSession: FetchSession | null = null;
  private fetchSessionCreation: Promise<FetchSession> | null = null;
  private resolveReadySignal!: () => void;
  private readonly readySignal = new Promise<void>((resolve) => {
    this.resolveReadySignal = resolve;
  });

  private readonly closeController = new AbortController();
  private readonly forceCloseController = new AbortController();
  private jobCompletionController = new AbortController();

  constructor(name: string, processor: Processor<Data, Result>, options: WorkerOptions) {
    super();
    validateQueueName(name);
    if (typeof processor !== 'function') {
      throw new Error('processor must be a function');
    }
    const redisUrl = validateWorkerOptions(options);
    this.queueName = name;
    this.processor = processor;
    this.keys = new QueueKeys(options.prefix ?? DEFAULT_PREFIX, name);
    this.concurrency = options.concurrency ?? 1;
    this.limiter = options.limiter === undefined ? undefined : { ...options.limiter };
    this.groupConcurrency = options.groupConcurrency ?? 0;
    this.lockDuration = options.lockDuration ?? 30_000;
    this.maxStalledCount = options.maxStalledCount ?? 1;
    this.stalledInterval = options.stalledInterval ?? STALLED_INTERVAL;

    this.client = createScriptedClient({
      redisUrl,
      role: 'worker',
    });
    // Explicitly use the default mapping to avoid costly inference over Redis's command types.
    this.blockingClient = new Redis<'legacy'>(redisUrl, {
      autoResendUnfulfilledCommands: false,
      // A short BLPOP poll can receive a late reply from a healthy connection.
      // Detect unresponsive connections independently of the polling interval.
      commandTimeout: REDIS_COMMAND_TIMEOUT,
      socketTimeout: REDIS_COMMAND_TIMEOUT,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
    });
    this.client.on('error', (err) => this.handleRedisError(err));
    this.blockingClient.on('error', (err) => this.handleRedisError(err));
    this.blockingClient.on('close', () => {
      this.blockingConnectionGeneration += 1;
    });

    if (options.autorun !== false) this.run();
  }

  /** Starts processing jobs. Only needed when the worker was created with `autorun: false`. */
  run(): void {
    if (this.runPromise || this.closing) return;
    if (this.preflightPromise) throw new Error('Worker preflight is still running');
    this.runPromise = this.runLoop();
  }

  /** Validates worker startup without claiming a job. Must be called before `run()`. */
  async preflight(): Promise<void> {
    if (this.runPromise) throw new Error('Worker has already been started');
    if (this.closing) throw new Error('Worker is closing');
    this.preflightPromise ??= this.runPreflight();
    const preflightPromise = this.preflightPromise;
    try {
      await preflightPromise;
    } finally {
      if (this.preflightPromise === preflightPromise) this.preflightPromise = null;
    }
  }

  private async runPreflight(): Promise<void> {
    while (!this.closing) {
      try {
        if (!(await this.prepareForFetch())) continue;
        await this.fetchNextJob(true);
        if (!(await this.blockingPop(`${this.keys.base}:preflight:${randomUUID()}`, 50))) continue;
        return;
      } catch (err) {
        if (this.closing) break;
        const error = this.fatalError ?? toError(err);
        if (isFatalStartupError(error)) {
          this.failWorker(error);
          throw error;
        }
        this.emitError(error);
        await waitForCompletionOrAbort([sleep(1000)], this.closeController.signal);
      }
    }

    if (this.fatalError) throw this.fatalError;
    throw new Error('Worker closed before preflight completed');
  }

  private startTimers() {
    // These timers issue Redis commands outside the main loop, so start them
    // only after this worker's compatibility and concurrency checks pass.
    this.lockTimer = setInterval(
      () => this.startLockRenewal(),
      Math.min(Math.max(Math.floor(this.lockDuration / 2), 50), FETCH_SESSION_HEARTBEAT),
    );
    // Schedule from completion so checks cannot overlap or run just before the
    // previous check's queue-wide lease expires.
    this.scheduleStalledCheck();
  }

  private scheduleStalledCheck() {
    this.stalledTimer = setTimeout(() => {
      this.stalledTimer = null;
      void this.checkStalledJobs().then(() => {
        if (!this.closing) this.scheduleStalledCheck();
      });
    }, this.stalledInterval);
  }

  /** Waits until both Redis connections are ready and the worker has successfully polled once. */
  async waitUntilReady(): Promise<void> {
    const initialFatalError = this.fatalError;
    if (initialFatalError) throw initialFatalError;
    if (this.ready) return;
    if (!this.runPromise) {
      throw new Error('Worker has not been started; call run() before waitUntilReady()');
    }
    await waitForCompletionOrAbort([this.readySignal], this.closeController.signal);
    const finalFatalError = this.fatalError;
    if (finalFatalError) throw finalFatalError;
    if (!this.ready) {
      throw new Error('Worker closed before becoming ready');
    }
  }

  /**
   * Stops fetching new jobs and waits for in-flight jobs to finish. With
   * `force`, in-flight jobs are abandoned instead (they will eventually be
   * picked up as stalled by another worker).
   */
  async close(force = false): Promise<void> {
    if (this.closed) return;
    if (force) this.forceClose();
    this.closePromise ??= this.doClose();
    await this.closePromise;
  }

  private failWorker(error: Error) {
    if (this.fatalError) return;
    this.fatalError = error;
    this.closing = true;
    this.resolveReadySignal();
    this.closeController.abort();
    this.forceClose();
    try {
      this.emitError(error);
    } finally {
      this.closed = true;
    }
  }

  private handleRedisError(err: unknown) {
    if (this.closed) return;
    const error = toError(err);
    if (isPermanentRedisError(error)) {
      this.failWorker(error);
      return;
    }
    this.emitError(error);
  }

  private forceClose() {
    if (this.forceClosing) return;
    this.forceClosing = true;
    this.forceCloseController.abort();
    if (this.lockTimer) clearInterval(this.lockTimer);
    if (this.stalledTimer) clearTimeout(this.stalledTimer);
    this.blockingClient.disconnect();
    this.client.disconnect();
  }

  private async doClose(): Promise<void> {
    this.closing = true;
    this.closeController.abort();
    if (this.stalledTimer) clearTimeout(this.stalledTimer);
    this.blockingClient.disconnect();
    if (this.preflightPromise) {
      try {
        await waitForCompletionOrAbort([this.preflightPromise], this.forceCloseController.signal);
      } catch {
        // A caller awaiting preflight receives its error; close still needs to
        // release the remaining Redis connection.
      }
    }
    if (this.runPromise) {
      await waitForCompletionOrAbort([this.runPromise], this.forceCloseController.signal);
    }
    if (!this.forceClosing) {
      await this.reconcilePendingFetch();
    }
    if (!this.forceClosing) {
      await waitForCompletionOrAbort(
        [Promise.all(this.processing)],
        this.forceCloseController.signal,
      );
    }
    if (this.lockTimer) clearInterval(this.lockTimer);
    if (!this.forceClosing && this.lockRenewalPromise) {
      await waitForCompletionOrAbort([this.lockRenewalPromise], this.forceCloseController.signal);
    }
    try {
      if (!this.forceClosing) {
        try {
          await this.client.quit();
        } catch {
          this.client.disconnect();
        }
      }
    } finally {
      this.closed = true;
    }
  }

  private async runLoop(): Promise<void> {
    let groupConcurrencyMismatchCount = 0;
    while (!this.closing) {
      try {
        if (!(await this.prepareForFetch())) continue;
        if (this.closing) break;
        if (!this.lockTimer) this.startTimers();
        let nextDelayedDelay: number | null = null;
        while (!this.closing && this.processing.size < this.concurrency) {
          const next = await this.fetchNextJob();
          if (this.forceClosing) break;
          groupConcurrencyMismatchCount = 0;
          if (!this.ready) {
            this.ready = true;
            this.resolveReadySignal();
          }
          if (next.job == null) {
            nextDelayedDelay = next.nextDelayedDelay;
            break;
          }
          this.startJob(next.job, next.token);
        }
        if (this.closing) break;

        const waiters: Promise<unknown>[] = [];
        if (this.processing.size < this.concurrency) {
          let timeoutMs = BLOCK_TIMEOUT;
          if (nextDelayedDelay != null) {
            timeoutMs = Math.min(timeoutMs, Math.max(nextDelayedDelay, 10));
          }
          waiters.push(this.waitForMarker(timeoutMs));
        }
        await waitForCompletionOrAbort(
          waiters,
          this.closeController.signal,
          this.jobCompletionController.signal,
        );
      } catch (err) {
        if (this.closing) break;
        const error = toError(err);
        if (isFatalStartupError(error)) {
          this.failWorker(error);
          return;
        }
        if (error instanceof GroupConcurrencyMismatchError) {
          groupConcurrencyMismatchCount += 1;
          if (groupConcurrencyMismatchCount >= MAX_GROUP_CONCURRENCY_MISMATCHES) {
            this.failWorker(error);
            return;
          }
        } else {
          groupConcurrencyMismatchCount = 0;
        }
        this.emitError(error);
        await waitForCompletionOrAbort([sleep(1000)], this.closeController.signal);
      }
    }
  }

  private async prepareForFetch(): Promise<boolean> {
    await waitForRedisReady([this.client, this.blockingClient], this.closeController.signal);
    if (this.closing) return false;
    const blockingConnectionGeneration = this.blockingConnectionGeneration;
    if (this.verifiedBlockingConnectionGeneration !== blockingConnectionGeneration) {
      await ensureSelectedDatabase(this.blockingClient);
      if (this.blockingConnectionGeneration !== blockingConnectionGeneration) return false;
      this.verifiedBlockingConnectionGeneration = blockingConnectionGeneration;
    }

    await this.client.ensureMinimumRedisVersion();
    if (!this.groupConcurrencyConfigured) {
      const configured = await this.client.pmqConfigureGroupConcurrency(
        this.keys.base,
        this.groupConcurrency,
      );
      if (configured !== this.groupConcurrency) {
        throw new GroupConcurrencyConfigurationError(
          `groupConcurrency is ${configured} for queue "${this.queueName}", not ${this.groupConcurrency}`,
        );
      }
      this.groupConcurrencyConfigured = true;
    }
    return true;
  }

  private async fetchNextJob(reconcile = false): Promise<{
    job: Job<Data, Result> | null;
    token: string;
    nextDelayedDelay: number | null;
  }> {
    while (true) {
      await this.client.ensureMinimumRedisVersion();
      const session = await this.getFetchSession();
      session.pending ??= {
        sequence: session.nextSequence++,
        token: randomUUID(),
      };
      const { sequence, token } = session.pending;
      const requestStartedAt = performance.now();
      const reply = await this.client.pmqMoveToActive(
        this.keys.base,
        session.id,
        session.startedAt,
        sequence,
        token,
        this.lockDuration,
        this.groupConcurrency,
        this.maxStalledCount,
        reconcile ? 'reconcile' : 'claim',
        this.limiter?.max ?? 0,
        this.limiter?.duration ?? 0,
      );

      // A slow reply can arrive after its job lock has expired. Replaying the
      // same fetch renews that lock without advancing the queue.
      if (reply?.[0] === 'job' && performance.now() - requestStartedAt >= this.lockDuration / 2) {
        continue;
      }

      // Redis caches every result for this sequence, so receiving a definitive
      // reply makes it safe to advance. Errors retain the request identity.
      session.pending = null;
      if (reply == null) {
        return { job: null, token, nextDelayedDelay: null };
      }
      if (reply[0] === 'session-expired') {
        if (this.fetchSession === session) this.fetchSession = null;
        if (this.closing) {
          return { job: null, token, nextDelayedDelay: null };
        }
        continue;
      }
      if (reply[0] === 'group-concurrency-mismatch') {
        throw new GroupConcurrencyMismatchError(
          `groupConcurrency is ${reply[1]} for queue "${this.queueName}", not ${this.groupConcurrency}`,
        );
      }
      if (reply[0] === 'delayed') {
        return {
          job: null,
          token,
          nextDelayedDelay: Number(reply[1]),
        };
      }
      if (reply[0] === 'cancelled' || reply[0] === 'claim-lost' || reply[0] === 'stale-fetch') {
        return { job: null, token, nextDelayedDelay: null };
      }
      if (reply[0] !== 'job') {
        throw new Error(`Redis returned invalid fetch result: ${reply[0] ?? '(missing)'}`);
      }
      const record: Record<string, string> = {};
      for (let i = 1; i < reply.length; i += 2) {
        record[reply[i]] = reply[i + 1];
      }
      return {
        job: jobFromRecord<Data, Result>(record),
        token,
        nextDelayedDelay: null,
      };
    }
  }

  private async getFetchSession(): Promise<FetchSession> {
    if (this.fetchSession) return this.fetchSession;
    this.fetchSessionCreation ??= this.client.time().then(([seconds, microseconds]) => ({
      id: randomUUID(),
      startedAt: Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000),
      nextSequence: 1,
      pending: null,
    }));
    const creation = this.fetchSessionCreation;
    try {
      this.fetchSession ??= await creation;
      return this.fetchSession;
    } finally {
      if (this.fetchSessionCreation === creation) this.fetchSessionCreation = null;
    }
  }

  private async reconcilePendingFetch(): Promise<void> {
    while (this.fetchSession?.pending && !this.forceClosing) {
      try {
        const next = await this.fetchNextJob(true);
        if (this.forceClosing) return;
        if (next.job) this.startJob(next.job, next.token);
      } catch (err) {
        if (this.forceClosing) return;
        this.handleRedisError(err);
        await waitForCompletionOrAbort([sleep(1000)], this.forceCloseController.signal);
      }
    }
  }

  private startJob(job: Job<Data, Result>, token: string) {
    this.activeTokens.set(job.id, token);
    const promise = this.processJob(job, token)
      .catch((err) => this.handleRedisError(err))
      .finally(() => {
        this.processing.delete(promise);
        if (this.activeTokens.get(job.id) === token) {
          this.activeTokens.delete(job.id);
        }
        this.finalizingTokens.delete(token);
        this.lostLockTokens.delete(token);
        // Signal completion without attaching another race handler to every
        // running job on each poll. A long-running job would retain them all.
        const jobCompletionController = this.jobCompletionController;
        this.jobCompletionController = new AbortController();
        jobCompletionController.abort();
      });
    this.processing.add(promise);
  }

  private async processJob(job: Job<Data, Result>, token: string): Promise<void> {
    let result: Result;
    try {
      result = await this.processor(job);
    } catch (err) {
      await this.handleFailedJob(job, token, toError(err));
      return;
    }

    let serializedResult: string;
    try {
      // A void processor has no result to persist; represent that absence with
      // the JSON value used by Job.returnvalue.
      serializedResult = serializeJson(result ?? null, 'Job result');
    } catch (err) {
      await this.handleFailedJob(job, token, toError(err), false);
      return;
    }

    this.finalizingTokens.add(token);
    await this.client.ensureMinimumRedisVersion();
    const code = await this.client.pmqMoveToCompleted(
      this.keys.base,
      job.id,
      token,
      serializedResult,
      encodeRemoveMode(job.options.removeOnComplete),
    );
    if (code === -1) {
      this.reportLostLock(token, `Lost lock for job ${job.id} before completion could be recorded`);
      return;
    }
  }

  private async handleFailedJob(job: Job<Data, Result>, token: string, error: Error, retry = true) {
    const willRetry =
      retry && !(error instanceof UnrecoverableError) && job.failedAttempts + 1 < job.attempts;
    const options = job.options;
    const retryDelay = willRetry ? computeBackoffDelay(options, job.failedAttempts) : 0;
    this.finalizingTokens.add(token);
    await this.client.ensureMinimumRedisVersion();
    const code = await this.client.pmqMoveToFailed(
      this.keys.base,
      job.id,
      token,
      willRetry ? 1 : 0,
      retryDelay,
      encodeRemoveMode(options.removeOnFail),
    );
    if (code === -1) {
      this.reportLostLock(token, `Lost lock for job ${job.id} before failure could be recorded`);
      return;
    }
    if (code === 0) {
      this.emit(
        'failed',
        createJob({
          id: job.id,
          name: job.name,
          data: job.data,
          options,
          groupId: job.groupId,
          failedAttempts: job.failedAttempts + 1,
          returnvalue: job.returnvalue,
        }),
        error,
      );
    }
  }

  private async blockingPop(key: string, timeoutMs: number): Promise<boolean> {
    const connectionGeneration = this.blockingConnectionGeneration;
    const stream = this.blockingClient.stream;
    try {
      await this.blockingClient.blpop(key, Math.max(timeoutMs, 50) / 1000);
    } catch (err) {
      // A command deadline rejects without cancelling Redis's pending BLPOP.
      // Close its socket so it cannot consume future wake-up markers. Capture
      // the socket before awaiting so a late failure cannot close its replacement.
      stream.destroy();
      throw err;
    }
    return this.blockingConnectionGeneration === connectionGeneration;
  }

  private waitForMarker(timeoutMs: number): Promise<void> {
    this.markerWait ??= this.blockingPop(this.keys.marker, timeoutMs)
      .then(() => undefined)
      .finally(() => {
        this.markerWait = null;
      });
    return this.markerWait;
  }

  private startLockRenewal() {
    if (this.lockRenewalPromise || this.activeTokens.size === 0) return;
    const renewal = this.extendLocks()
      .catch((err) => this.handleRedisError(err))
      .finally(() => {
        if (this.lockRenewalPromise === renewal) this.lockRenewalPromise = null;
      });
    this.lockRenewalPromise = renewal;
  }

  private async extendLocks() {
    const locks = [...this.activeTokens];
    if (locks.length === 0) return;
    await this.client.ensureMinimumRedisVersion();
    const fetchSession = await this.getFetchSession();
    const lostJobIds = await this.client.pmqExtendLocks(
      this.keys.base,
      fetchSession.id,
      this.lockDuration,
      ...locks.flatMap(([jobId, token]) => [jobId, token]),
    );
    const renewedTokens = new Map(locks);
    for (const jobId of lostJobIds) {
      const token = renewedTokens.get(jobId);
      if (
        token != null &&
        this.activeTokens.get(jobId) === token &&
        !this.finalizingTokens.has(token)
      ) {
        this.reportLostLock(token, `Lost lock while processing job ${jobId}`);
      }
    }
  }

  private reportLostLock(token: string, message: string) {
    if (this.lostLockTokens.has(token)) return;
    this.lostLockTokens.add(token);
    this.emitError(new Error(message));
  }

  private async checkStalledJobs() {
    try {
      await this.client.ensureMinimumRedisVersion();
      const [requeued, failed] = await this.client.pmqCheckStalled(
        this.keys.base,
        Date.now(),
        this.stalledInterval,
      );
      for (const jobId of requeued) {
        this.emit('stalled', jobId, false);
      }
      for (const jobId of failed) {
        this.emit('stalled', jobId, true);
      }
    } catch (err) {
      if (!this.closing) this.handleRedisError(err);
    }
  }

  private emitError(error: Error) {
    if (this.closed) return;
    this.emit('error', error);
  }
}
