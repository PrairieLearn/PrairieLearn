import { Job } from './job.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { type PrairieMQRedis, createScriptedClient } from './scripts.js';
import type { GroupStatus, JobCounts, JobOptions, JobState, QueueOptions } from './types.js';

const MAX_PRIORITY = 2 ** 20;

export function validateQueueName(name: string) {
  if (!/^[\w.-]+$/.test(name)) {
    throw new Error(`Invalid queue name "${name}": only [A-Za-z0-9_.-] characters are allowed`);
  }
}

function validateJobOptions(opts: JobOptions) {
  if (opts.jobId != null && opts.jobId === '') {
    throw new Error('jobId must be a non-empty string');
  }
  if (opts.delay != null && (!Number.isInteger(opts.delay) || opts.delay < 0)) {
    throw new Error('delay must be a non-negative integer');
  }
  if (
    opts.priority != null &&
    (!Number.isInteger(opts.priority) || opts.priority < 0 || opts.priority > MAX_PRIORITY)
  ) {
    throw new Error(`priority must be an integer between 0 and ${MAX_PRIORITY}`);
  }
  if (opts.attempts != null && (!Number.isInteger(opts.attempts) || opts.attempts < 1)) {
    throw new Error('attempts must be a positive integer');
  }
  if (opts.group != null && opts.group.id === '') {
    throw new Error('group.id must be a non-empty string');
  }
}

export class Queue<Data = unknown, Result = unknown> {
  readonly name: string;
  readonly keys: QueueKeys;
  private readonly client: PrairieMQRedis;
  private readonly defaultJobOptions: JobOptions;

  constructor(name: string, options: QueueOptions) {
    validateQueueName(name);
    this.name = name;
    this.keys = new QueueKeys(options.prefix ?? DEFAULT_PREFIX, name);
    this.defaultJobOptions = options.defaultJobOptions ?? {};
    this.client = createScriptedClient(options.redisUrl);
  }

  async add(name: string, data: Data, options: JobOptions = {}): Promise<Job<Data, Result>> {
    const opts = { ...this.defaultJobOptions, ...options };
    validateJobOptions(opts);

    const timestamp = Date.now();
    const groupId = opts.group?.id ?? '';
    const [jobId, created] = await this.client.pmqAddJob(
      this.keys.base,
      opts.jobId ?? '',
      name,
      JSON.stringify(data ?? null),
      JSON.stringify(opts),
      timestamp,
      opts.delay ?? 0,
      opts.priority ?? 0,
      opts.attempts ?? 1,
      groupId,
    );

    if (created === 0) {
      const existing = await this.getJob(jobId);
      if (existing) return existing;
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

  async addBulk(
    jobs: { name: string; data: Data; options?: JobOptions }[],
  ): Promise<Job<Data, Result>[]> {
    const added: Job<Data, Result>[] = [];
    for (const job of jobs) {
      added.push(await this.add(job.name, job.data, job.options));
    }
    return added;
  }

  async getJob(jobId: string): Promise<Job<Data, Result> | null> {
    const record = await this.client.hgetall(this.keys.job(jobId));
    if (Object.keys(record).length === 0) return null;
    return Job.fromRecord<Data, Result>(record);
  }

  async getJobState(jobId: string): Promise<JobState> {
    const [activeIndex, delayedScore, completedScore, failedScore, exists] = await Promise.all([
      this.client.lpos(this.keys.active, jobId),
      this.client.zscore(this.keys.delayed, jobId),
      this.client.zscore(this.keys.completed, jobId),
      this.client.zscore(this.keys.failed, jobId),
      this.client.exists(this.keys.job(jobId)),
    ]);
    if (activeIndex != null) return 'active';
    if (delayedScore != null) return 'delayed';
    if (completedScore != null) return 'completed';
    if (failedScore != null) return 'failed';
    if (exists) return 'waiting';
    return 'unknown';
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
    const stream = this.client.scanStream({ match: `${this.keys.base}:*`, count: 250 });
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
