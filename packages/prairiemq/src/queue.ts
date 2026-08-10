import { Job } from './job.js';
import { serializeJson } from './json.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { type PrairieMQRedis, createScriptedClient } from './scripts.js';
import type { GroupStatus, JobCounts, JobOptions, JobState, QueueOptions } from './types.js';

const MAX_PRIORITY = 2 ** 20;
const MAX_BULK_JOBS = 1000;

function escapeRedisGlob(value: string): string {
  return value.replaceAll(/[\\*?[\]]/g, '\\$&');
}

export interface JobStatus<Data = unknown, Result = unknown> {
  state: JobState;
  job: Job<Data, Result> | null;
}

interface PreparedJob<Data> {
  name: string;
  data: Data;
  opts: JobOptions;
  timestamp: number;
  groupId: string;
  serializedData: string;
  serializedOptions: string;
}

type AddJobReply = [string, number, ...string[]];

export function validateQueueName(name: string) {
  if (typeof name !== 'string' || !/^[\w.-]+$/.test(name)) {
    throw new Error(`Invalid queue name "${name}": only [A-Za-z0-9_.-] characters are allowed`);
  }
}

const JOB_OPTION_NAMES = new Set<keyof JobOptions>([
  'jobId',
  'delay',
  'priority',
  'attempts',
  'backoff',
  'group',
  'removeOnComplete',
  'removeOnFail',
]);

function validateJobOptions(opts: JobOptions) {
  if (
    typeof opts !== 'object' ||
    opts === null ||
    Array.isArray(opts) ||
    Object.getPrototypeOf(opts) !== Object.prototype
  ) {
    throw new Error('Job options must be a plain object');
  }
  for (const name of Object.keys(opts)) {
    if (!JOB_OPTION_NAMES.has(name as keyof JobOptions)) {
      throw new Error(`Unknown job option "${name}"`);
    }
  }
  if (opts.jobId !== undefined && (typeof opts.jobId !== 'string' || opts.jobId === '')) {
    throw new Error('jobId must be a non-empty string');
  }
  if (opts.jobId !== undefined && /^\d+$/.test(opts.jobId)) {
    throw new Error('jobId must not be purely numeric because numeric ids are auto-generated');
  }
  if (opts.delay !== undefined && (!Number.isSafeInteger(opts.delay) || opts.delay < 0)) {
    throw new Error('delay must be a non-negative integer');
  }
  if (
    opts.priority !== undefined &&
    (!Number.isSafeInteger(opts.priority) || opts.priority < 0 || opts.priority > MAX_PRIORITY)
  ) {
    throw new Error(`priority must be an integer between 0 and ${MAX_PRIORITY}`);
  }
  if (opts.attempts !== undefined && (!Number.isSafeInteger(opts.attempts) || opts.attempts < 1)) {
    throw new Error('attempts must be a positive integer');
  }
  if (
    opts.group !== undefined &&
    (typeof opts.group !== 'object' ||
      opts.group === null ||
      Object.getPrototypeOf(opts.group) !== Object.prototype ||
      Object.keys(opts.group).some((name) => name !== 'id') ||
      typeof opts.group.id !== 'string' ||
      opts.group.id === '')
  ) {
    throw new Error('group.id must be a non-empty string');
  }
  if (opts.backoff !== undefined) {
    if (
      typeof opts.backoff !== 'number' &&
      (typeof opts.backoff !== 'object' || opts.backoff === null)
    ) {
      throw new Error('backoff must be a non-negative integer or backoff options');
    }
    if (
      typeof opts.backoff === 'object' &&
      (Object.getPrototypeOf(opts.backoff) !== Object.prototype ||
        Object.keys(opts.backoff).some((name) => name !== 'type' && name !== 'delay'))
    ) {
      throw new Error('backoff must contain only type and delay');
    }
    const delay = typeof opts.backoff === 'number' ? opts.backoff : opts.backoff.delay;
    if (!Number.isSafeInteger(delay) || delay < 0) {
      throw new Error('backoff delay must be a non-negative integer');
    }
    if (
      typeof opts.backoff !== 'number' &&
      opts.backoff.type !== 'fixed' &&
      opts.backoff.type !== 'exponential'
    ) {
      throw new Error('backoff type must be "fixed" or "exponential"');
    }
  }
  for (const [name, value] of [
    ['removeOnComplete', opts.removeOnComplete],
    ['removeOnFail', opts.removeOnFail],
  ] as const) {
    if (
      value !== undefined &&
      typeof value !== 'boolean' &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    ) {
      throw new Error(`${name} must be a boolean or a positive integer`);
    }
  }
}

function mergeJobOptions(defaults: JobOptions, overrides: JobOptions): JobOptions {
  return {
    ...defaults,
    ...Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined)),
  } as JobOptions;
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

export class Queue<Data = unknown, Result = unknown> {
  readonly name: string;
  readonly keys: QueueKeys;
  private readonly client: PrairieMQRedis;
  private readonly defaultJobOptions: JobOptions;

  constructor(name: string, options: QueueOptions) {
    validateQueueName(name);
    if (options.defaultJobOptions !== undefined) {
      validateJobOptions(options.defaultJobOptions);
    }
    this.name = name;
    this.keys = new QueueKeys(options.prefix ?? DEFAULT_PREFIX, name);
    this.defaultJobOptions = mergeJobOptions({}, options.defaultJobOptions ?? {});
    this.client = createScriptedClient(options.redisUrl, 'queue');
  }

  private prepareJob(name: string, data: Data, options: JobOptions): PreparedJob<Data> {
    if (typeof name !== 'string' || name === '') {
      throw new Error('Job name must be a non-empty string');
    }
    validateJobOptions(options);
    const opts = mergeJobOptions(this.defaultJobOptions, options);
    validateJobOptions(opts);

    const timestamp = Date.now();
    const groupId = opts.group?.id ?? '';
    return {
      name,
      data,
      opts,
      timestamp,
      groupId,
      serializedData: serializeJson(data, 'Job data'),
      serializedOptions: serializeJson(opts, 'Job options'),
    };
  }

  private jobFromAddReply(prepared: PreparedJob<Data>, reply: AddJobReply): Job<Data, Result> {
    const { name, data, opts, timestamp, groupId } = prepared;
    if (typeof reply[0] !== 'string') {
      throw new Error('Redis returned a malformed job id');
    }
    const jobId = reply[0];
    const created = Number(reply[1]);
    if (created !== 0 && created !== 1) {
      throw new Error(`Redis returned invalid job creation result: ${reply[1]}`);
    }

    if (created === 0) {
      const record: Record<string, string> = {};
      for (let i = 2; i < reply.length; i += 2) {
        const field = reply[i];
        const value = reply[i + 1];
        if (typeof field !== 'string' || typeof value !== 'string') {
          throw new Error('Redis returned a malformed existing job record');
        }
        record[field] = value;
      }
      return Job.fromRecord<Data, Result>(record);
    }

    return new Job<Data, Result>({
      id: jobId,
      name,
      data,
      opts,
      timestamp,
      groupId: groupId === '' ? null : groupId,
      attemptsMade: 0,
      stalledCount: 0,
      processedOn: null,
      finishedOn: null,
      returnvalue: null,
      failedReason: null,
    });
  }

  async add(name: string, data: Data, options: JobOptions = {}): Promise<Job<Data, Result>> {
    const prepared = this.prepareJob(name, data, options);
    const reply = await this.client.pmqAddJob(
      this.keys.base,
      prepared.opts.jobId ?? '',
      prepared.name,
      prepared.serializedData,
      prepared.serializedOptions,
      prepared.timestamp,
      prepared.opts.delay ?? 0,
      prepared.opts.priority ?? 0,
      prepared.opts.attempts ?? 1,
      prepared.groupId,
    );
    return this.jobFromAddReply(prepared, reply);
  }

  async addBulk(
    jobs: readonly { name: string; data: Data; options?: JobOptions }[],
  ): Promise<Job<Data, Result>[]> {
    if (!Array.isArray(jobs)) throw new Error('jobs must be an array');
    if (jobs.length > MAX_BULK_JOBS) {
      throw new Error(`addBulk accepts at most ${MAX_BULK_JOBS} jobs`);
    }
    const prepared = jobs.map((job, index) => {
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

    const replies = await this.client.pmqAddBulk(
      this.keys.base,
      prepared.length,
      ...prepared.flatMap((job) => [
        job.opts.jobId ?? '',
        job.name,
        job.serializedData,
        job.serializedOptions,
        job.timestamp,
        job.opts.delay ?? 0,
        job.opts.priority ?? 0,
        job.opts.attempts ?? 1,
        job.groupId,
      ]),
    );
    if (replies.length !== prepared.length) {
      throw new Error('Redis returned an invalid number of bulk job results');
    }
    return replies.map((reply, index) => this.jobFromAddReply(prepared[index], reply));
  }

  async getJob(jobId: string): Promise<Job<Data, Result> | null> {
    const record = await this.client.hgetall(this.keys.job(jobId));
    if (Object.keys(record).length === 0) return null;
    return Job.fromRecord<Data, Result>(record);
  }

  async getJobState(jobId: string): Promise<JobState> {
    const reply = await this.client.pmqGetJobStatus(this.keys.base, jobId, 0);
    return parseJobState(reply[0]);
  }

  /** Atomically reads a job and its state for cross-process status polling. */
  async getJobStatus(jobId: string): Promise<JobStatus<Data, Result>> {
    const reply = await this.client.pmqGetJobStatus(this.keys.base, jobId, 1);
    const state = parseJobState(reply[0]);
    if (state === 'unknown') return { state, job: null };

    const record: Record<string, string> = {};
    for (let i = 1; i < reply.length; i += 2) {
      record[reply[i]] = reply[i + 1];
    }
    return { state, job: Job.fromRecord<Data, Result>(record) };
  }

  async getJobCounts(): Promise<JobCounts> {
    const [waiting, active, delayed, completed, failed] = await this.client.pmqGetCounts(
      this.keys.base,
    );
    return { waiting, active, delayed, completed, failed };
  }

  /** Returns the groups that currently have waiting or active jobs. */
  async getGroups(): Promise<GroupStatus[]> {
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
    await this.client.set(this.keys.paused, '1');
  }

  async resume(): Promise<void> {
    await this.client
      .multi()
      .del(this.keys.paused)
      .lpush(this.keys.marker, '1')
      .ltrim(this.keys.marker, 0, 99)
      .exec();
  }

  async isPaused(): Promise<boolean> {
    return (await this.client.exists(this.keys.paused)) === 1;
  }

  /**
   * Removes all waiting (and optionally delayed) jobs. Active jobs are left
   * untouched. Returns the number of removed jobs.
   */
  async drain(includeDelayed = false): Promise<number> {
    return await this.client.pmqDrain(this.keys.base, includeDelayed ? 1 : 0);
  }

  /**
   * Deletes all data associated with this queue, including active jobs and
   * job history. Intended for tests and administrative cleanup; close all
   * workers first.
   */
  async obliterate(): Promise<void> {
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
    await this.client.quit();
  }
}
