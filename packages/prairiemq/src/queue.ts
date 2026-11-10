import { EventEmitter } from 'node:events';

import { type Job, createJob, jobFromRecord } from './job.js';
import { serializeJson } from './json.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { type PrairieMQRedis, createScriptedClient } from './scripts.js';
import type {
  DeduplicatedJobOptions,
  DefaultJobOptions,
  GroupStatus,
  JobCounts,
  JobOptions,
  JobState,
  QueueOptions,
  RateLimiterOptions,
  ScheduledJobOptions,
} from './types.js';
import {
  normalizeRedisUrl,
  validateOptionsObject,
  validatePrefix,
  validateRateLimiter,
} from './validation.js';

const MAX_BULK_JOBS = 1000;
const QUEUE_OPTION_NAMES = new Set<keyof QueueOptions>(['redisUrl', 'prefix', 'defaultJobOptions']);

function escapeRedisGlob(value: string): string {
  return value.replaceAll(/[\\*?[\]]/g, '\\$&');
}

export interface JobStatus<Data = unknown, Result = unknown> {
  state: JobState;
  job: Job<Data, Result> | null;
}

export interface QueueEvents {
  error: [error: Error];
}

interface PreparedJob<Data> {
  name: string;
  data: Data;
  opts: JobOptions;
  groupId: string;
  serializedData: string;
  serializedOptions: string;
}

type AddJobDisposition =
  | 'created'
  | 'existing-job-id'
  | 'deduplicated'
  | 'job-id-deduplication-conflict';

export interface AddJobResult<Data = unknown, Result = unknown> {
  job: Job<Data, Result>;
  disposition: AddJobDisposition;
}

type AddJobReply = [string, string, ...string[]];
type BulkJobConflictReply = [string, string, string, ...string[]];

function isBulkJobConflictReply(
  replies: AddJobReply[] | BulkJobConflictReply,
): replies is BulkJobConflictReply {
  return typeof replies[0] === 'string';
}

export class JobIdDeduplicationConflictError<Data = unknown, Result = unknown> extends Error {
  readonly job: Job<Data, Result>;
  readonly deduplicationId: string;

  constructor(job: Job<Data, Result>, deduplicationId: string) {
    super(`Job id "${job.id}" already owns a different deduplication id`);
    this.name = 'JobIdDeduplicationConflictError';
    this.job = job;
    this.deduplicationId = deduplicationId;
  }
}

export function validateQueueName(name: string) {
  if (typeof name !== 'string' || !/^[\w.-]+$/.test(name)) {
    throw new Error(`Invalid queue name "${name}": only [A-Za-z0-9_.-] characters are allowed`);
  }
}

function validateJobOptions(opts: JobOptions): void {
  const { jobId, delay, priority, attempts, group, deduplication, backoff } = opts;
  if (jobId === '') {
    throw new Error('jobId must be a non-empty string');
  }
  if (jobId !== undefined && /^\d+$/.test(jobId)) {
    throw new Error('jobId must not be purely numeric because numeric ids are auto-generated');
  }
  if (delay !== undefined && (!Number.isSafeInteger(delay) || delay < 0)) {
    throw new Error('delay must be a non-negative integer');
  }
  if (
    priority !== undefined &&
    (!Number.isInteger(priority) || priority < 0 || priority > 2_097_152)
  ) {
    throw new Error('priority must be an integer between 0 and 2097152');
  }
  if (attempts !== undefined && (!Number.isSafeInteger(attempts) || attempts < 1)) {
    throw new Error('attempts must be a positive integer');
  }
  if (group?.id === '') {
    throw new Error('group.id must be a non-empty string');
  }
  if (deduplication?.id === '') {
    throw new Error('deduplication.id must be a non-empty string');
  }
  if (backoff !== undefined) {
    if (!Number.isSafeInteger(backoff.delay) || backoff.delay < 0) {
      throw new Error('backoff delay must be a non-negative integer');
    }
    if (
      backoff.jitter !== undefined &&
      (!Number.isFinite(backoff.jitter) || backoff.jitter < 0 || backoff.jitter > 1)
    ) {
      throw new Error('backoff jitter must be a number between 0 and 1');
    }
  }
  for (const [name, value] of [
    ['removeOnComplete', opts.removeOnComplete],
    ['removeOnFail', opts.removeOnFail],
  ] as const) {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 1)) {
      throw new Error(`${name} must be a boolean or a positive integer`);
    }
  }
}

function validateDefaultJobOptions(opts: JobOptions): void {
  validateJobOptions(opts);
  if (opts.jobId !== undefined) {
    throw new Error(
      'defaultJobOptions must not include jobId; set jobId on each added job instead',
    );
  }
  if (opts.deduplication !== undefined) {
    throw new Error(
      'defaultJobOptions must not include deduplication; set deduplication on each added job instead',
    );
  }
}

function validateQueueOptions(options: QueueOptions): string {
  const optionRecord = validateOptionsObject('Queue', options, QUEUE_OPTION_NAMES);
  const redisUrl = normalizeRedisUrl(optionRecord.redisUrl);
  validatePrefix(optionRecord.prefix);
  if (options.defaultJobOptions !== undefined) {
    validateDefaultJobOptions(options.defaultJobOptions);
  }
  return redisUrl;
}

function mergeJobOptions(
  defaults: DefaultJobOptions,
  overrides: DefaultJobOptions,
): DefaultJobOptions;
function mergeJobOptions(defaults: DefaultJobOptions, overrides: JobOptions): JobOptions;

function mergeJobOptions(defaults: DefaultJobOptions, overrides: JobOptions): JobOptions {
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  };
}

function parseJobState(value: string | undefined): JobState {
  switch (value) {
    case 'waiting':
    case 'active':
    case 'delayed':
    case 'completed':
    case 'failed':
    case 'unknown':
      return value;
    default:
      throw new Error(`Redis returned invalid job state: ${value ?? '(missing)'}`);
  }
}

export class Queue<Data = unknown, Result = unknown> extends EventEmitter<QueueEvents> {
  private readonly keys: QueueKeys;
  private readonly client: PrairieMQRedis;
  private readonly defaultJobOptions: DefaultJobOptions;

  constructor(name: string, options: QueueOptions) {
    super();
    validateQueueName(name);
    const redisUrl = validateQueueOptions(options);
    this.keys = new QueueKeys(options.prefix ?? DEFAULT_PREFIX, name);
    this.defaultJobOptions = mergeJobOptions({}, options.defaultJobOptions ?? {});
    this.client = createScriptedClient({
      redisUrl,
      role: 'queue',
    });
    this.client.on('error', (err) => this.emit('error', err));
  }

  private prepareJob(
    name: string,
    data: Data,
    options: JobOptions,
    defaults: DefaultJobOptions = this.defaultJobOptions,
  ): PreparedJob<Data> {
    if (typeof name !== 'string' || name === '') {
      throw new Error('Job name must be a non-empty string');
    }
    const opts = mergeJobOptions(defaults, options);
    validateJobOptions(opts);

    const groupId = opts.group?.id ?? '';
    return {
      name,
      data,
      opts,
      groupId,
      serializedData: serializeJson(data, 'Job data'),
      serializedOptions: serializeJson(opts, 'Job options'),
    };
  }

  private jobResultFromAddReply(
    prepared: PreparedJob<Data>,
    reply: AddJobReply,
  ): AddJobResult<Data, Result> {
    const { name, data, opts, groupId } = prepared;
    if (typeof reply[0] !== 'string') {
      throw new Error('Redis returned a malformed job id');
    }
    const jobId = reply[0];
    const disposition = reply[1];
    if (
      disposition !== 'created' &&
      disposition !== 'existing-job-id' &&
      disposition !== 'deduplicated' &&
      disposition !== 'job-id-deduplication-conflict'
    ) {
      throw new Error(`Redis returned invalid job add disposition: ${disposition}`);
    }

    if (disposition !== 'created') {
      const record: Record<string, string> = {};
      for (let i = 2; i < reply.length; i += 2) {
        const field = reply[i];
        const value = reply[i + 1];
        if (typeof field !== 'string' || typeof value !== 'string') {
          throw new Error('Redis returned a malformed existing job record');
        }
        record[field] = value;
      }
      return { job: jobFromRecord<Data, Result>(record), disposition };
    }

    return {
      job: createJob<Data, Result>({
        id: jobId,
        name,
        data,
        options: opts,
        groupId: groupId || null,
        failedAttempts: 0,
        returnvalue: null,
      }),
      disposition,
    };
  }

  private async addPreparedJob(
    prepared: PreparedJob<Data>,
    deduplicationMode: 0 | 1 | 2,
  ): Promise<AddJobResult<Data, Result>> {
    await this.waitUntilReady();
    const reply = await this.client.pmqAddJob(
      this.keys.base,
      prepared.opts.jobId ?? '',
      prepared.name,
      prepared.serializedData,
      prepared.serializedOptions,
      prepared.opts.delay ?? 0,
      prepared.groupId,
      prepared.opts.deduplication?.id ?? '',
      deduplicationMode,
    );
    return this.jobResultFromAddReply(prepared, reply);
  }

  private jobFromAddResult(result: AddJobResult<Data, Result>, prepared: PreparedJob<Data>) {
    if (result.disposition === 'job-id-deduplication-conflict') {
      throw new JobIdDeduplicationConflictError(result.job, prepared.opts.deduplication?.id ?? '');
    }
    return result.job;
  }

  async add(name: string, data: Data, options: JobOptions = {}): Promise<Job<Data, Result>> {
    const prepared = this.prepareJob(name, data, options);
    return this.jobFromAddResult(await this.addPreparedJob(prepared, 0), prepared);
  }

  private prepareDeduplicatedJob(
    name: string,
    data: Data,
    deduplicationId: string,
    options: DeduplicatedJobOptions = {},
  ): PreparedJob<Data> {
    if (typeof deduplicationId !== 'string' || deduplicationId === '') {
      throw new Error('deduplicationId must be a non-empty string');
    }
    const unrestrictedOptions = options as JobOptions;
    if (unrestrictedOptions.jobId !== undefined) {
      throw new Error('Deduplicated job options cannot use jobId');
    }
    if (unrestrictedOptions.deduplication !== undefined) {
      throw new Error('deduplication must be supplied through deduplicationId');
    }
    return this.prepareJob(name, data, {
      ...unrestrictedOptions,
      deduplication: { id: deduplicationId },
    });
  }

  /**
   * Reuses a waiting or delayed job with this deduplication ID, but creates a
   * follow-up job when the mapped job has already started.
   */
  async addDeduplicatedUntilActive(
    name: string,
    data: Data,
    deduplicationId: string,
    options: DeduplicatedJobOptions = {},
  ): Promise<Job<Data, Result>> {
    const prepared = this.prepareDeduplicatedJob(name, data, deduplicationId, options);
    return this.jobFromAddResult(await this.addPreparedJob(prepared, 1), prepared);
  }

  /** Reuses waiting, delayed, or active work, but replaces a finished mapping. */
  async addDeduplicatedUntilFinished(
    name: string,
    data: Data,
    deduplicationId: string,
    options: DeduplicatedJobOptions = {},
  ): Promise<Job<Data, Result>> {
    const prepared = this.prepareDeduplicatedJob(name, data, deduplicationId, options);
    return this.jobFromAddResult(await this.addPreparedJob(prepared, 2), prepared);
  }

  async addBulk(
    jobs: readonly { name: string; data: Data; options?: JobOptions }[],
  ): Promise<Job<Data, Result>[]> {
    if (!Array.isArray(jobs)) throw new Error('jobs must be an array');
    if (jobs.length > MAX_BULK_JOBS) {
      throw new Error(`addBulk accepts at most ${MAX_BULK_JOBS} jobs`);
    }
    const prepared = Array.from(jobs, (job, index) => {
      if (
        typeof job !== 'object' ||
        job === null ||
        Array.isArray(job) ||
        Object.getPrototypeOf(job) !== Object.prototype ||
        Object.keys(job).some((name) => name !== 'name' && name !== 'data' && name !== 'options')
      ) {
        throw new Error(`Bulk job ${index} must contain only name, data, and options`);
      }
      return this.prepareJob(job.name, job.data, job.options === undefined ? {} : job.options);
    });
    if (prepared.length === 0) return [];

    const deduplicationIdsByJobId = new Map<string, string>();
    for (const job of prepared) {
      const jobId = job.opts.jobId;
      const deduplicationId = job.opts.deduplication?.id;
      if (jobId === undefined || deduplicationId === undefined) continue;
      const previousDeduplicationId = deduplicationIdsByJobId.get(jobId);
      if (previousDeduplicationId !== undefined && previousDeduplicationId !== deduplicationId) {
        throw new Error(`Bulk jobs with job id "${jobId}" use different deduplication ids`);
      }
      deduplicationIdsByJobId.set(jobId, deduplicationId);
    }

    await this.waitUntilReady();
    const replies = await this.client.pmqAddBulk(
      this.keys.base,
      prepared.length,
      ...prepared.flatMap((job) => [
        job.opts.jobId ?? '',
        job.name,
        job.serializedData,
        job.serializedOptions,
        job.opts.delay ?? 0,
        job.groupId,
        job.opts.deduplication?.id ?? '',
      ]),
    );
    if (isBulkJobConflictReply(replies)) {
      const [rawIndex, jobId, disposition, ...fields] = replies;
      const index = Number(rawIndex) - 1;
      if (!Number.isSafeInteger(index) || index < 0 || index >= prepared.length) {
        throw new Error('Redis returned an invalid bulk job conflict index');
      }
      const result = this.jobResultFromAddReply(prepared[index], [jobId, disposition, ...fields]);
      if (result.disposition !== 'job-id-deduplication-conflict') {
        throw new Error('Redis returned an invalid bulk job conflict');
      }
      throw new JobIdDeduplicationConflictError(
        result.job,
        prepared[index].opts.deduplication?.id ?? '',
      );
    }
    if (replies.length !== prepared.length) {
      throw new Error('Redis returned an invalid number of bulk job results');
    }
    return replies.map((reply, index) => {
      const jobResult = this.jobResultFromAddReply(prepared[index], reply);
      return this.jobFromAddResult(jobResult, prepared[index]);
    });
  }

  async getDeduplicationJobId(deduplicationId: string): Promise<string | null> {
    if (typeof deduplicationId !== 'string' || deduplicationId === '') {
      throw new Error('deduplicationId must be a non-empty string');
    }
    await this.waitUntilReady();
    return await this.client.get(this.keys.deduplication(deduplicationId));
  }

  async removeDeduplicationKey(deduplicationId: string): Promise<void> {
    if (typeof deduplicationId !== 'string' || deduplicationId === '') {
      throw new Error('deduplicationId must be a non-empty string');
    }
    await this.waitUntilReady();
    await this.client.del(this.keys.deduplication(deduplicationId));
  }

  async upsertJobScheduler(
    schedulerId: string,
    repeat: { every: number },
    template: { name: string; data: Data; options?: ScheduledJobOptions },
  ): Promise<void> {
    if (typeof schedulerId !== 'string' || schedulerId === '') {
      throw new Error('schedulerId must be a non-empty string');
    }
    const repeatValue: unknown = repeat;
    if (
      typeof repeatValue !== 'object' ||
      repeatValue === null ||
      Array.isArray(repeatValue) ||
      Object.getPrototypeOf(repeatValue) !== Object.prototype
    ) {
      throw new Error('repeat.every must be a positive integer');
    }
    const repeatRecord = repeatValue as Record<string, unknown>;
    if (
      Object.keys(repeatRecord).some((name) => name !== 'every') ||
      typeof repeatRecord.every !== 'number' ||
      !Number.isSafeInteger(repeatRecord.every) ||
      repeatRecord.every < 1
    ) {
      throw new Error('repeat.every must be a positive integer');
    }
    const templateValue: unknown = template;
    if (
      typeof templateValue !== 'object' ||
      templateValue === null ||
      Array.isArray(templateValue) ||
      Object.getPrototypeOf(templateValue) !== Object.prototype
    ) {
      throw new Error('Scheduler template must contain only name, data, and options');
    }
    const templateRecord = templateValue as Record<string, unknown>;
    if (
      Object.keys(templateRecord).some(
        (name) => name !== 'name' && name !== 'data' && name !== 'options',
      )
    ) {
      throw new Error('Scheduler template must contain only name, data, and options');
    }
    if (!Object.hasOwn(templateRecord, 'data')) {
      throw new Error('Scheduler template data is required');
    }

    const templateOptions: JobOptions = template.options ?? {};
    if (
      templateOptions.jobId !== undefined ||
      templateOptions.delay !== undefined ||
      templateOptions.deduplication !== undefined
    ) {
      throw new Error('Scheduled jobs cannot use jobId, delay, or deduplication');
    }
    // The scheduler's interval determines when each occurrence runs, so a
    // queue-wide default delay does not apply.
    const { delay: _delay, ...schedulerDefaults } = this.defaultJobOptions;
    const prepared = this.prepareJob(
      template.name,
      template.data,
      templateOptions,
      schedulerDefaults,
    );

    await this.waitUntilReady();
    await this.client.pmqUpsertJobScheduler(
      this.keys.base,
      schedulerId,
      prepared.name,
      prepared.serializedData,
      prepared.serializedOptions,
      repeatRecord.every,
      prepared.groupId,
    );
  }

  /** Returns the ids of all persistent job schedulers in this queue. */
  async getJobSchedulerIds(): Promise<string[]> {
    await this.waitUntilReady();
    return await this.client.zrange(this.keys.schedulers, '0', '-1');
  }

  /** Atomically removes both records for a persistent job scheduler. */
  async removeJobScheduler(schedulerId: string): Promise<boolean> {
    if (typeof schedulerId !== 'string' || schedulerId === '') {
      throw new Error('schedulerId must be a non-empty string');
    }
    await this.waitUntilReady();
    return (await this.client.pmqRemoveJobScheduler(this.keys.base, schedulerId)) > 0;
  }

  /** Atomically reads a job and its state for cross-process status polling. */
  async getJobStatus(jobId: string): Promise<JobStatus<Data, Result>> {
    await this.waitUntilReady();
    const reply = await this.client.pmqGetJobStatus(this.keys.base, jobId);
    const state = parseJobState(reply[0]);
    if (state === 'unknown') return { state, job: null };

    const record: Record<string, string> = {};
    for (let i = 1; i < reply.length; i += 2) {
      record[reply[i]] = reply[i + 1];
    }
    return { state, job: jobFromRecord<Data, Result>(record) };
  }

  async getJobCounts(): Promise<JobCounts> {
    await this.waitUntilReady();
    const [waiting, active, delayed, completed, failed] = await this.client.pmqGetCounts(
      this.keys.base,
    );
    return { waiting, active, delayed, completed, failed };
  }

  /** Returns the groups that currently have waiting or active jobs. */
  async getGroups(): Promise<GroupStatus[]> {
    await this.waitUntilReady();
    const reply = await this.client.pmqGetGroups(this.keys.base);
    const groups: GroupStatus[] = [];
    for (let i = 0; i < reply.length; i += 3) {
      groups.push({
        id: reply[i] === '' ? null : reply[i],
        waiting: Number(reply[i + 1]),
        active: Number(reply[i + 2]),
      });
    }
    return groups;
  }

  async pause(): Promise<void> {
    await this.waitUntilReady();
    await this.client.set(this.keys.paused, '1');
  }

  /**
   * Updates the shared policy used by every worker, or disables it with null.
   * Preserves the current window's count and expiry, so a deployment cannot
   * reset its budget. A changed duration takes effect in the next window.
   */
  async setRateLimit(limiter: RateLimiterOptions | null): Promise<void> {
    if (limiter !== null) validateRateLimiter(limiter);
    await this.waitUntilReady();
    await this.client.hset(
      `${this.keys.base}:limiter-config`,
      'max',
      limiter?.max ?? 0,
      'duration',
      limiter?.duration ?? 0,
    );
  }

  async resume(): Promise<void> {
    await this.waitUntilReady();
    await this.client
      .multi()
      .del(this.keys.paused)
      .lpush(this.keys.marker, '1')
      .ltrim(this.keys.marker, 0, 99)
      .exec();
  }

  /** Waits for Redis and verifies that its version is supported. */
  async waitUntilReady(): Promise<void> {
    await this.client.ensureMinimumRedisVersion();
  }

  /**
   * Deletes all data associated with this queue, including active jobs and
   * job history. Intended for tests and administrative cleanup; close all
   * workers first.
   */
  async obliterate(): Promise<void> {
    await this.waitUntilReady();
    const stream = this.client.scanStream({
      match: `${escapeRedisGlob(this.keys.base)}:*`,
      count: 250,
    });
    for await (const keys of stream) {
      if ((keys as string[]).length > 0) {
        await this.client.unlink(...(keys as string[]));
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
