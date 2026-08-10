import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

import { Redis } from 'ioredis';

import { Job } from './job.js';
import { serializeJson } from './json.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { validateQueueName } from './queue.js';
import { type PrairieMQRedis, createScriptedClient } from './scripts.js';
import type { JobOptions, WorkerOptions } from './types.js';

export type Processor<Data, Result> = (job: Job<Data, Result>) => Promise<Result>;

interface WorkerEvents<Data, Result> {
  /** A job finished successfully. */
  completed: [job: Job<Data, Result>, result: Result];
  /** A job failed and has no attempts left. */
  failed: [job: Job<Data, Result>, error: Error];
  /** A job failed but will be retried. */
  retrying: [job: Job<Data, Result>, error: Error];
  /** A job's lock expired; it was requeued or (past maxStalledCount) failed. */
  stalled: [jobId: string];
  error: [error: Error];
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function encodeRemoveMode(value: boolean | number | undefined): number {
  if (value === true) return -1;
  if (typeof value === 'number' && value > 0) return Math.floor(value);
  return 0;
}

function computeBackoffDelay(job: { opts: JobOptions; attemptsMade: number }): number {
  const backoff = job.opts.backoff;
  if (backoff == null) return 0;
  if (typeof backoff === 'number') return backoff;
  if (backoff.type === 'fixed') return backoff.delay;
  return Math.round(backoff.delay * 2 ** (job.attemptsMade - 1));
}

function validateIntegerOption(name: string, value: number, minimum: number) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    const requirement = minimum === 0 ? 'a non-negative integer' : 'a positive integer';
    throw new Error(`${name} must be ${requirement}`);
  }
}

function waitForRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  if (client.status === 'end') return Promise.reject(new Error('Redis connection has closed'));

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      client.off('ready', onReady);
      client.off('end', onEnd);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onEnd = () => {
      cleanup();
      reject(new Error('Redis connection closed before becoming ready'));
    };
    client.on('ready', onReady);
    client.on('end', onEnd);
  });
}

export class Worker<Data = unknown, Result = unknown> extends EventEmitter<
  WorkerEvents<Data, Result>
> {
  readonly name: string;
  private readonly processor: Processor<Data, Result>;
  private readonly keys: QueueKeys;
  private readonly client: PrairieMQRedis;
  private readonly blockingClient: Redis;
  private readonly concurrency: number;
  private readonly groupConcurrency: number;
  private readonly lockDuration: number;
  private readonly stalledInterval: number;
  private readonly maxStalledCount: number;
  private readonly blockTimeout: number;

  private readonly processing = new Set<Promise<void>>();
  private readonly activeTokens = new Map<string, string>();
  private closing = false;
  private closed = false;
  private runPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private markerWait: Promise<void> | null = null;
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private stalledTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private resolveReadySignal!: () => void;
  private readonly readySignal = new Promise<void>((resolve) => {
    this.resolveReadySignal = resolve;
  });

  private resolveCloseSignal!: () => void;
  private readonly closeSignal = new Promise<void>((resolve) => {
    this.resolveCloseSignal = resolve;
  });

  constructor(name: string, processor: Processor<Data, Result>, options: WorkerOptions) {
    super();
    validateQueueName(name);
    this.name = name;
    this.processor = processor;
    this.keys = new QueueKeys(options.prefix ?? DEFAULT_PREFIX, name);
    this.concurrency = options.concurrency ?? 1;
    this.groupConcurrency = options.groupConcurrency ?? 0;
    this.lockDuration = options.lockDuration ?? 30_000;
    this.stalledInterval = options.stalledInterval ?? 30_000;
    this.maxStalledCount = options.maxStalledCount ?? 1;
    this.blockTimeout = options.blockTimeout ?? 1000;
    validateIntegerOption('concurrency', this.concurrency, 1);
    validateIntegerOption('groupConcurrency', this.groupConcurrency, 0);
    validateIntegerOption('lockDuration', this.lockDuration, 1);
    validateIntegerOption('stalledInterval', this.stalledInterval, 1);
    validateIntegerOption('maxStalledCount', this.maxStalledCount, 0);
    validateIntegerOption('blockTimeout', this.blockTimeout, 1);
    if (this.lockDuration < 100) {
      throw new Error('lockDuration must be at least 100ms');
    }

    this.client = createScriptedClient(options.redisUrl);
    this.blockingClient = new Redis(options.redisUrl, { maxRetriesPerRequest: null });

    if (options.autorun !== false) this.run();
  }

  /** Starts processing jobs. Only needed when the worker was created with `autorun: false`. */
  run(): void {
    if (this.runPromise || this.closing) return;
    this.lockTimer = setInterval(
      () => void this.extendLocks(),
      Math.max(Math.floor(this.lockDuration / 2), 50),
    );
    this.stalledTimer = setInterval(() => void this.checkStalledJobs(), this.stalledInterval);
    this.runPromise = this.runLoop();
  }

  /** Waits until both Redis connections are ready and the worker has successfully polled once. */
  async waitUntilReady(): Promise<void> {
    if (this.ready) return;
    if (!this.runPromise) {
      throw new Error('Worker has not been started; call run() before waitUntilReady()');
    }
    await Promise.race([this.readySignal, this.closeSignal]);
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
    this.closePromise ??= this.doClose(force);
    await this.closePromise;
  }

  private async doClose(force: boolean): Promise<void> {
    this.closing = true;
    this.resolveCloseSignal();
    if (this.stalledTimer) clearInterval(this.stalledTimer);
    this.blockingClient.disconnect();
    if (force) {
      if (this.lockTimer) clearInterval(this.lockTimer);
      this.client.disconnect();
    }
    await this.runPromise;
    if (!force) {
      await Promise.all(this.processing);
      if (this.lockTimer) clearInterval(this.lockTimer);
    }
    try {
      if (!force) await this.client.quit();
    } finally {
      this.closed = true;
    }
  }

  private async runLoop(): Promise<void> {
    while (!this.closing) {
      try {
        await Promise.all([waitForRedisReady(this.client), waitForRedisReady(this.blockingClient)]);
        let nextDelayedUntil: number | null = null;
        while (!this.closing && this.processing.size < this.concurrency) {
          const next = await this.fetchNextJob();
          if (!this.ready) {
            this.ready = true;
            this.resolveReadySignal();
          }
          if (next.job == null) {
            nextDelayedUntil = next.nextDelayedUntil;
            break;
          }
          this.startJob(next.job, next.token);
        }
        if (this.closing) break;

        const waiters: Promise<unknown>[] = [this.closeSignal, ...this.processing];
        if (this.processing.size < this.concurrency) {
          let timeoutMs = this.blockTimeout;
          if (nextDelayedUntil != null) {
            timeoutMs = Math.min(timeoutMs, Math.max(nextDelayedUntil - Date.now(), 10));
          }
          waiters.push(this.waitForMarker(timeoutMs));
        }
        await Promise.race(waiters);
      } catch (err) {
        if (this.closing) break;
        this.emitError(toError(err));
        await Promise.race([sleep(1000), this.closeSignal]);
      }
    }
  }

  private async fetchNextJob(): Promise<{
    job: Job<Data, Result> | null;
    token: string;
    nextDelayedUntil: number | null;
  }> {
    const token = randomUUID();
    const reply = await this.client.pmqMoveToActive(
      this.keys.base,
      Date.now(),
      token,
      this.lockDuration,
      this.groupConcurrency,
    );
    if (reply == null) return { job: null, token, nextDelayedUntil: null };
    if (reply[0] === 'delayed') {
      return { job: null, token, nextDelayedUntil: Number(reply[1]) };
    }
    const record: Record<string, string> = {};
    for (let i = 1; i < reply.length; i += 2) {
      record[reply[i]] = reply[i + 1];
    }
    return { job: Job.fromRecord<Data, Result>(record), token, nextDelayedUntil: null };
  }

  private startJob(job: Job<Data, Result>, token: string) {
    this.activeTokens.set(job.id, token);
    const promise = this.processJob(job, token)
      .catch((err) => this.emitError(toError(err)))
      .finally(() => {
        this.processing.delete(promise);
        this.activeTokens.delete(job.id);
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
      serializedResult = serializeJson(result, 'Job result');
    } catch (err) {
      await this.handleFailedJob(job, token, toError(err), false);
      return;
    }

    const code = await this.client.pmqMoveToCompleted(
      this.keys.base,
      job.id,
      token,
      serializedResult,
      Date.now(),
      encodeRemoveMode(job.opts.removeOnComplete),
    );
    if (code === -1) {
      this.emitError(new Error(`Lost lock for job ${job.id} before completion could be recorded`));
      return;
    }
    this.emit('completed', job, result);
  }

  private async handleFailedJob(job: Job<Data, Result>, token: string, error: Error, retry = true) {
    const willRetry = retry && job.attemptsMade < job.attempts;
    const retryDelay = willRetry ? computeBackoffDelay(job) : 0;
    const code = await this.client.pmqMoveToFailed(
      this.keys.base,
      job.id,
      token,
      error.message,
      Date.now(),
      willRetry ? 1 : 0,
      retryDelay,
      encodeRemoveMode(job.opts.removeOnFail),
    );
    if (code === -1) {
      this.emitError(new Error(`Lost lock for job ${job.id} before failure could be recorded`));
      return;
    }
    if (code === 1) {
      this.emit('retrying', job, error);
    } else {
      this.emit('failed', job, error);
    }
  }

  private waitForMarker(timeoutMs: number): Promise<void> {
    this.markerWait ??= this.blockingClient
      .blpop(this.keys.marker, Math.max(timeoutMs, 50) / 1000)
      .then(() => undefined)
      .catch((err) => {
        if (!this.closing) this.emitError(toError(err));
      })
      .finally(() => {
        this.markerWait = null;
      });
    return this.markerWait;
  }

  private async extendLocks() {
    for (const [jobId, token] of this.activeTokens) {
      try {
        await this.client.pmqExtendLock(this.keys.base, jobId, token, this.lockDuration);
      } catch (err) {
        this.emitError(toError(err));
      }
    }
  }

  private async checkStalledJobs() {
    try {
      const [requeued, failed] = await this.client.pmqCheckStalled(
        this.keys.base,
        this.maxStalledCount,
        Date.now(),
      );
      for (const jobId of [...requeued, ...failed]) {
        this.emit('stalled', jobId);
      }
    } catch (err) {
      if (!this.closing) this.emitError(toError(err));
    }
  }

  // An 'error' event with no listener would crash the process, and worker
  // errors (e.g. a Redis blip) are recoverable, so only emit when someone is
  // listening.
  private emitError(error: Error) {
    if (this.closed) return;
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
  }
}
