import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { JobIdDeduplicationConflictError, Queue } from './queue.js';
import type { PrairieMQRedis } from './scripts.js';
import type {
  DeduplicatedJobOptions,
  JobOptions,
  QueueOptions,
  ScheduledJobOptions,
} from './types.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/';

describe('Queue', () => {
  let queue: Queue;
  let queueBase: string;
  let queueName: string;

  beforeEach(() => {
    queueName = `test-${randomUUID()}`;
    queueBase = new QueueKeys(DEFAULT_PREFIX, queueName).base;
    queue = new Queue(queueName, { redisUrl });
  });

  afterEach(async () => {
    await queue.obliterate();
    await queue.close();
  });

  it('adds a job and reads it back', async () => {
    const job = await queue.add('send-email', { to: 'user@example.com' });
    assert.isString(job.id);

    const status = await queue.getJobStatus(job.id);
    assert.equal(status.state, 'waiting');
    const fetched = status.job;
    assert.ok(fetched);
    assert.equal(fetched.name, 'send-email');
    assert.deepEqual(fetched.data, { to: 'user@example.com' });
    assert.equal(fetched.failedAttempts, 0);
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 1,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    });
  });

  it('disconnects if graceful close fails', async () => {
    const closingQueue = new Queue(`test-${randomUUID()}`, { redisUrl });
    const client = Reflect.get(closingQueue, 'client') as {
      quit: () => Promise<string>;
      disconnect: () => void;
    };
    vi.spyOn(client, 'quit').mockRejectedValueOnce(new Error('Redis connection closed'));
    const disconnect = vi.spyOn(client, 'disconnect');

    await expect(closingQueue.close()).resolves.toBeUndefined();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects unsupported Redis versions', async () => {
    const unsupportedQueue = new Queue(`test-${randomUUID()}`, { redisUrl });
    const client = Reflect.get(unsupportedQueue, 'client') as PrairieMQRedis;
    if (client.status !== 'ready') await once(client, 'ready');
    vi.spyOn(client, 'info').mockResolvedValue('# Server\r\nredis_version:6.0.20\r\n');

    await expect(unsupportedQueue.waitUntilReady()).rejects.toThrow(
      'PrairieMQ requires Redis 6.2.0 or later; connected server is 6.0.20',
    );

    await unsupportedQueue.close();
  });

  it('does not reuse a version check completed by an older connection', async () => {
    await queue.waitUntilReady();
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    let finishOldCheck!: (info: string) => void;
    const oldCheckFinished = new Promise<string>((resolve) => {
      finishOldCheck = resolve;
    });
    let finishNewCheck!: (info: string) => void;
    const newCheckFinished = new Promise<string>((resolve) => {
      finishNewCheck = resolve;
    });
    const info = vi
      .spyOn(client, 'info')
      .mockReturnValueOnce(oldCheckFinished)
      .mockReturnValueOnce(newCheckFinished);

    client.emit('close');
    let oldWaitResolved = false;
    const oldWait = queue.waitUntilReady().then(() => {
      oldWaitResolved = true;
    });
    await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(1));

    client.emit('close');
    const newWait = queue.waitUntilReady();
    await vi.waitFor(() => expect(info).toHaveBeenCalledTimes(2));
    finishOldCheck('# Server\r\nredis_version:6.2.0\r\n');
    await Promise.resolve();
    await Promise.resolve();
    assert.isFalse(oldWaitResolved);

    finishNewCheck('# Server\r\nredis_version:6.2.0\r\n');
    await Promise.all([oldWait, newWait]);
  });

  it('rejects an unavailable Redis database instead of using database zero', async () => {
    const invalidDatabaseUrl = new URL(redisUrl);
    invalidDatabaseUrl.pathname = '/999999';
    const invalidDatabaseQueue = new Queue(`test-${randomUUID()}`, {
      redisUrl: invalidDatabaseUrl.href,
    });
    invalidDatabaseQueue.on('error', () => {});

    try {
      await expect(invalidDatabaseQueue.waitUntilReady()).rejects.toThrow(
        'DB index is out of range',
      );
    } finally {
      await invalidDatabaseQueue.close();
    }
  });

  it('deduplicates jobs with the same custom job id', async () => {
    const first = await queue.add('task', { attempt: 1 }, { jobId: 'custom-id' });
    const second = await queue.add('task', { attempt: 2 }, { jobId: 'custom-id' });

    assert.equal(first.id, 'custom-id');
    assert.equal(second.id, 'custom-id');
    assert.deepEqual(second.data, { attempt: 1 });

    const counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 1);
  });

  it('atomically adopts a deduplication id for an existing custom-id job', async () => {
    const first = await queue.add(
      'task',
      { attempt: 1 },
      { jobId: 'custom-id', attempts: 2, removeOnComplete: true },
    );
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const originalOptions = await client.hget(`${queueBase}:job:${first.id}`, 'opts');

    const adopted = await queue.add(
      'ignored',
      { attempt: 2 },
      {
        jobId: 'custom-id',
        attempts: 9,
        deduplication: { id: 'shared-deduplication' },
        removeOnComplete: false,
      },
    );

    assert.equal(adopted.id, first.id);
    assert.deepEqual(adopted.data, first.data);
    assert.equal(adopted.attempts, 2);
    assert.equal(await queue.getDeduplicationJobId('shared-deduplication'), first.id);
    assert.equal(
      await client.hget(`${queueBase}:job:${first.id}`, 'deduplicationId'),
      'shared-deduplication',
    );
    assert.equal(await client.hget(`${queueBase}:job:${first.id}`, 'opts'), originalOptions);
  });

  it('rejects assigning a different deduplication id to an existing custom-id job', async () => {
    await queue.add(
      'task',
      {},
      { jobId: 'custom-id', deduplication: { id: 'first-deduplication' } },
    );

    await expect(
      queue.add('task', {}, { jobId: 'custom-id', deduplication: { id: 'second-deduplication' } }),
    ).rejects.toBeInstanceOf(JobIdDeduplicationConflictError);

    assert.equal(await queue.getDeduplicationJobId('first-deduplication'), 'custom-id');
    assert.isNull(await queue.getDeduplicationJobId('second-deduplication'));
    assert.equal((await queue.getJobCounts()).waiting, 1);
  });

  it('lets an existing deduplication mapping take precedence over a different custom id', async () => {
    await queue.add('unrelated', {}, { jobId: 'custom-id' });
    const owner = await queue.add(
      'owner',
      { owner: true },
      { jobId: 'owner-id', deduplication: { id: 'shared-deduplication' } },
    );

    const selected = await queue.add(
      'ignored',
      { owner: false },
      { jobId: 'custom-id', deduplication: { id: 'shared-deduplication' } },
    );

    assert.equal(selected.id, owner.id);
    assert.deepEqual(selected.data, owner.data);
    assert.equal((await queue.getJobCounts()).waiting, 2);
  });

  it('deduplicates jobs with the same deduplication id', async () => {
    const first = await queue.add(
      'task',
      { attempt: 1 },
      { deduplication: { id: 'shared-deduplication' } },
    );
    const second = await queue.add(
      'task',
      { attempt: 2 },
      { deduplication: { id: 'shared-deduplication' } },
    );

    assert.equal(second.id, first.id);
    assert.deepEqual(second.data, { attempt: 1 });
    assert.equal(await queue.getDeduplicationJobId('shared-deduplication'), first.id);

    await queue.removeDeduplicationKey('shared-deduplication');
    const third = await queue.add(
      'task',
      { attempt: 3 },
      { deduplication: { id: 'shared-deduplication' } },
    );
    assert.notEqual(third.id, first.id);
    assert.equal(await queue.getDeduplicationJobId('shared-deduplication'), third.id);
    assert.equal((await queue.getJobCounts()).waiting, 2);
  });

  it('preserves the next run when a scheduler is upserted unchanged', async () => {
    await queue.upsertJobScheduler(
      'heartbeat',
      { every: 60_000 },
      { name: 'heartbeat', data: null },
    );
    const client = Reflect.get(queue, 'client') as {
      zscore: (key: string, member: string) => Promise<string | null>;
    };
    const queueBase = (Reflect.get(queue, 'keys') as { base: string }).base;
    const firstNextRun = await client.zscore(`${queueBase}:schedulers`, 'heartbeat');

    await queue.upsertJobScheduler(
      'heartbeat',
      { every: 60_000 },
      { name: 'heartbeat', data: null },
    );

    assert.isNotNull(firstNextRun);
    assert.equal(await client.zscore(`${queueBase}:schedulers`, 'heartbeat'), firstNextRun);
  });

  it('uses Redis time when scheduling the first run', async () => {
    await queue.waitUntilReady();
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const [seconds, microseconds] = await client.time();
    const redisNow = Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(redisNow - 60 * 60 * 1000);
    try {
      await queue.upsertJobScheduler(
        'heartbeat',
        { every: 60_000 },
        { name: 'heartbeat', data: null },
      );
    } finally {
      dateNow.mockRestore();
    }

    const nextRun = await client.zscore(`${queueBase}:schedulers`, 'heartbeat');
    assert.isNotNull(nextRun);
    assert.isAtLeast(Number(nextRun), redisNow + 60_000);
  });

  it('lists and atomically removes persistent job schedulers', async () => {
    await queue.upsertJobScheduler('first', { every: 60_000 }, { name: 'first', data: null });
    await queue.upsertJobScheduler('second', { every: 60_000 }, { name: 'second', data: null });

    assert.sameMembers(await queue.getJobSchedulerIds(), ['first', 'second']);
    assert.isTrue(await queue.removeJobScheduler('first'));
    assert.isFalse(await queue.removeJobScheduler('first'));
    assert.deepEqual(await queue.getJobSchedulerIds(), ['second']);

    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    assert.equal(await client.exists(`${queueBase}:scheduler:first`), 0);
    assert.isNull(await client.zscore(`${queueBase}:schedulers`, 'first'));
  });

  it('tracks delayed jobs in the delayed state', async () => {
    const job = await queue.add('later', {}, { delay: 60_000 });

    assert.equal((await queue.getJobStatus(job.id)).state, 'delayed');
    const counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 0);
    assert.equal(counts.delayed, 1);
  });

  it('adds multiple jobs in order with addBulk', async () => {
    const jobs = await queue.addBulk([
      { name: 'a', data: 1 },
      { name: 'b', data: 2 },
      { name: 'c', data: 3 },
    ]);

    assert.lengthOf(jobs, 3);
    assert.deepEqual(
      jobs.map((job) => job.name),
      ['a', 'b', 'c'],
    );
    const counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 3);
  });

  it('deduplicates custom ids within addBulk', async () => {
    const jobs = await queue.addBulk([
      { name: 'first', data: { value: 1 }, options: { jobId: 'shared-id' } },
      { name: 'second', data: { value: 2 }, options: { jobId: 'shared-id' } },
    ]);

    assert.equal(jobs[0].id, 'shared-id');
    assert.deepEqual(jobs[1], jobs[0]);
    assert.equal((await queue.getJobCounts()).waiting, 1);
  });

  it('deduplicates deduplication ids within addBulk', async () => {
    const jobs = await queue.addBulk([
      {
        name: 'first',
        data: { value: 1 },
        options: { deduplication: { id: 'shared-deduplication' } },
      },
      {
        name: 'second',
        data: { value: 2 },
        options: { deduplication: { id: 'shared-deduplication' } },
      },
    ]);

    assert.equal(jobs[1].id, jobs[0].id);
    assert.deepEqual(jobs[1].data, { value: 1 });
    assert.equal((await queue.getJobCounts()).waiting, 1);
  });

  it('rejects bulk custom-id deduplication conflicts before adding any jobs', async () => {
    await queue.add(
      'existing',
      {},
      { jobId: 'existing-id', deduplication: { id: 'first-deduplication' } },
    );

    await expect(
      queue.addBulk([
        { name: 'would-be-added', data: {} },
        {
          name: 'conflict',
          data: {},
          options: {
            jobId: 'existing-id',
            deduplication: { id: 'second-deduplication' },
          },
        },
      ]),
    ).rejects.toBeInstanceOf(JobIdDeduplicationConflictError);
    assert.equal((await queue.getJobCounts()).waiting, 1);

    await expect(
      queue.addBulk([
        {
          name: 'first',
          data: {},
          options: { jobId: 'new-id', deduplication: { id: 'first' } },
        },
        {
          name: 'second',
          data: {},
          options: { jobId: 'new-id', deduplication: { id: 'second' } },
        },
      ]),
    ).rejects.toThrow('use different deduplication ids');
    assert.equal((await queue.getJobCounts()).waiting, 1);
  });

  it('validates every bulk job before adding any of them', async () => {
    await expect(
      queue.addBulk([
        { name: 'valid', data: { value: 1 } },
        { name: 'invalid', data: { value: 1n } },
      ]),
    ).rejects.toThrow('bigint values');
    await expect(
      queue.addBulk(Array.from({ length: 1001 }, (_, data) => ({ name: 'job', data }))),
    ).rejects.toThrow('at most 1000 jobs');

    assert.equal((await queue.getJobCounts()).waiting, 0);
  });

  it('rejects sparse bulk arrays before adding any jobs', async () => {
    const jobs = [
      { name: 'first', data: {} },
      { name: 'second', data: {} },
    ];
    jobs.length = 3;

    await expect(queue.addBulk(jobs)).rejects.toThrow(
      'Bulk job 2 must contain only name, data, and options',
    );
    assert.equal((await queue.getJobCounts()).waiting, 0);
  });

  it('reports group statuses', async () => {
    await queue.add('one', {}, { group: { id: 'alpha' } });
    await queue.add('two', {}, { group: { id: 'alpha' } });
    await queue.add('three', {}, { group: { id: 'beta' } });
    await queue.add('four', {});

    const groups = await queue.getGroups();
    const byId = new Map(groups.map((group) => [group.id, group]));
    assert.equal(byId.get('alpha')?.waiting, 2);
    assert.equal(byId.get('beta')?.waiting, 1);
    assert.equal(byId.get(null)?.waiting, 1);
  });

  it('tracks group rotation membership without duplicating groups', async () => {
    await queue.addBulk([
      { name: 'one', data: {}, options: { group: { id: 'alpha' } } },
      { name: 'two', data: {}, options: { group: { id: 'alpha' } } },
      { name: 'three', data: {}, options: { group: { id: 'beta' } } },
      { name: 'four', data: {} },
    ]);
    const client = Reflect.get(queue, 'client') as {
      lrange: (key: string, start: number, stop: number) => Promise<string[]>;
      smembers: (key: string) => Promise<string[]>;
    };

    assert.deepEqual(await client.lrange(`${queueBase}:groups`, 0, -1), ['alpha', 'beta', '']);
    assert.sameMembers(await client.smembers(`${queueBase}:group-members`), ['alpha', 'beta', '']);
  });

  it('does not let glob characters in a prefix affect another queue', async () => {
    const prefix = `test-${randomUUID()}`;
    const wildcardQueue = new Queue('shared-name', { redisUrl, prefix: `${prefix}-*` });
    const otherQueue = new Queue('shared-name', { redisUrl, prefix: `${prefix}-other` });
    try {
      await wildcardQueue.add('wildcard', {});
      const otherJob = await otherQueue.add('other', {});

      await wildcardQueue.obliterate();

      assert.equal((await wildcardQueue.getJobStatus('1')).state, 'unknown');
      assert.equal((await otherQueue.getJobStatus(otherJob.id)).state, 'waiting');
    } finally {
      await wildcardQueue.obliterate();
      await otherQueue.obliterate();
      await wildcardQueue.close();
      await otherQueue.close();
    }
  });

  it('returns unknown state for missing jobs', async () => {
    assert.deepEqual(await queue.getJobStatus('does-not-exist'), {
      state: 'unknown',
      job: null,
    });
  });

  it('validates shared rate limiter updates', async () => {
    for (const limiter of [
      { max: 0, duration: 1000 },
      { max: 1, duration: 0 },
      { max: 1.5, duration: 1000 },
      { max: 1, duration: 2_147_483_648 },
    ]) {
      await expect(queue.setRateLimit(limiter)).rejects.toThrow('limiter.');
    }
  });

  it('rejects invalid job option values', async () => {
    await expect(queue.add('', {})).rejects.toThrow('name');
    await expect(queue.add(42 as unknown as string, {})).rejects.toThrow('name');
    await expect(queue.add('bad', {}, { jobId: '' })).rejects.toThrow('jobId');
    await expect(queue.add('bad', {}, { jobId: '123' })).rejects.toThrow('purely numeric');
    for (const delay of [-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(queue.add('bad', {}, { delay })).rejects.toThrow('delay');
      await expect(
        queue.add('bad', {}, { backoff: { type: 'exponential', delay } }),
      ).rejects.toThrow('backoff delay');
    }
    await expect(queue.add('bad', {}, { attempts: 0 })).rejects.toThrow('attempts');
    await expect(queue.add('bad', {}, { group: { id: '' } })).rejects.toThrow('group.id');
    await expect(queue.add('bad', {}, { deduplication: { id: '' } })).rejects.toThrow(
      'deduplication.id',
    );
    for (const priority of [-1, 1.5, 2_097_153, Number.NaN]) {
      await expect(queue.add('bad', {}, { priority })).rejects.toThrow('priority');
    }
    for (const jitter of [-0.1, 1.1, Number.NaN]) {
      await expect(
        queue.add('bad', {}, { backoff: { type: 'exponential', delay: 1, jitter } }),
      ).rejects.toThrow('jitter');
    }
    for (const count of [0, -1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(queue.add('bad', {}, { removeOnComplete: count })).rejects.toThrow(
        'removeOnComplete',
      );
      await expect(queue.add('bad', {}, { removeOnFail: count })).rejects.toThrow('removeOnFail');
    }
    await expect(
      queue.addDeduplicatedUntilFinished('bad', {}, 'deduplication', {
        jobId: 'custom',
      } as unknown as DeduplicatedJobOptions),
    ).rejects.toThrow('Deduplicated job options cannot use jobId');
  });

  it('rejects job data that cannot be stored as JSON', async () => {
    await expect(queue.add('bad', undefined)).rejects.toThrow('undefined values');
    await expect(queue.add('bad', { value: 1n })).rejects.toThrow('bigint values');
    await expect(queue.add('bad', { value: undefined })).rejects.toThrow('undefined values');
    await expect(queue.add('bad', new Date(0))).rejects.toThrow('plain objects');
    const sparseArray: unknown[] = [];
    sparseArray.length = 1;
    await expect(queue.add('bad', sparseArray)).rejects.toThrow(
      'Job data contains an invalid JSON value at $[0]: undefined values are not allowed',
    );
    const arrayWithSymbolProperty: unknown[] = [];
    Object.defineProperty(arrayWithSymbolProperty, Symbol('hidden'), { value: true });
    await expect(queue.add('bad', arrayWithSymbolProperty)).rejects.toThrow(
      'symbol properties are not allowed',
    );

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(queue.add('bad', circular)).rejects.toThrow('circular references');

    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    });
  });

  it('validates default job options when the queue is created', () => {
    expect(
      () =>
        new Queue(`invalid-${randomUUID()}`, {
          redisUrl,
          defaultJobOptions: { removeOnFail: -1 },
        }),
    ).toThrow('removeOnFail');

    expect(
      () =>
        new Queue(`invalid-${randomUUID()}`, {
          redisUrl,
          defaultJobOptions: {
            // @ts-expect-error -- Job ids must be supplied for individual jobs.
            jobId: 'shared-default',
          },
        }),
    ).toThrow('defaultJobOptions must not include jobId');

    const jobOptions: JobOptions = { jobId: 'shared-default' };
    expect(
      () =>
        new Queue(`invalid-${randomUUID()}`, {
          redisUrl,
          // @ts-expect-error -- Per-job options may contain an id and cannot be used as defaults.
          defaultJobOptions: jobOptions,
        }),
    ).toThrow('defaultJobOptions must not include jobId');
  });

  it('rejects invalid queue options before connecting to Redis', () => {
    const invalidOptions: [unknown, string][] = [
      [undefined, 'Queue options must be a plain object'],
      [null, 'Queue options must be a plain object'],
      [[], 'Queue options must be a plain object'],
      [7, 'Queue options must be a plain object'],
      [{ redisUrl, redisURL: redisUrl }, 'Unknown queue option "redisURL"'],
      [{}, 'redisUrl'],
      [{ redisUrl: null }, 'redisUrl'],
      [{ redisUrl: '' }, 'redisUrl'],
      [{ redisUrl: '   ' }, 'redisUrl'],
      [{ redisUrl: 'localhost:6379' }, 'redisUrl'],
      [{ redisUrl: 'http://localhost:6379' }, 'redisUrl'],
      [{ redisUrl: 'redis://' }, 'redisUrl'],
      [{ redisUrl, prefix: null }, 'prefix'],
      [{ redisUrl, prefix: '' }, 'prefix'],
      [{ redisUrl, prefix: 42 }, 'prefix'],
    ];

    for (const [options, message] of invalidOptions) {
      expect(() => new Queue(`invalid-${randomUUID()}`, options as QueueOptions)).toThrow(message);
    }
  });

  it('applies default options without defaulting job ids', async () => {
    const defaultQueue = new Queue(`defaults-${randomUUID()}`, {
      redisUrl,
      defaultJobOptions: { attempts: 3, jobId: undefined },
    });

    try {
      const jobs = await defaultQueue.addBulk([
        { name: 'first', data: {}, options: { attempts: undefined, jobId: undefined } },
        { name: 'second', data: {}, options: { attempts: undefined, jobId: undefined } },
      ]);

      assert.notEqual(jobs[0].id, jobs[1].id);
      assert.deepEqual(
        jobs.map((job) => job.attempts),
        [3, 3],
      );
      assert.equal((await defaultQueue.getJobCounts()).waiting, 2);
    } finally {
      await defaultQueue.obliterate();
      await defaultQueue.close();
    }
  });

  it('rejects invalid job schedulers', async () => {
    await expect(
      queue.upsertJobScheduler('', { every: 1000 }, { name: 'job', data: null }),
    ).rejects.toThrow('schedulerId');
    await expect(
      queue.upsertJobScheduler('job', { every: 0 }, { name: 'job', data: null }),
    ).rejects.toThrow('repeat.every');
    await expect(
      queue.upsertJobScheduler('job', { every: 1000 }, { name: 'job' } as unknown as {
        name: string;
        data: unknown;
      }),
    ).rejects.toThrow('data is required');
    await expect(
      queue.upsertJobScheduler(
        'job',
        { every: 1000 },
        {
          name: 'job',
          data: null,
          options: { delay: 1 } as unknown as ScheduledJobOptions,
        },
      ),
    ).rejects.toThrow('Scheduled jobs');
    await expect(queue.removeJobScheduler('')).rejects.toThrow('schedulerId');
  });
});
