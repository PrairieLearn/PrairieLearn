import { randomUUID } from 'node:crypto';

import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import { Queue } from './queue.js';
import type { JobOptions } from './types.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/';

describe('Queue', () => {
  let queue: Queue;

  beforeEach(() => {
    queue = new Queue(`test-${randomUUID()}`, { redisUrl });
  });

  afterEach(async () => {
    await queue.obliterate();
    await queue.close();
  });

  it('adds a job and reads it back', async () => {
    const job = await queue.add('send-email', { to: 'user@example.com' });
    assert.isString(job.id);

    const fetched = await queue.getJob(job.id);
    assert.ok(fetched);
    assert.equal(fetched.name, 'send-email');
    assert.deepEqual(fetched.data, { to: 'user@example.com' });
    assert.equal(fetched.attemptsMade, 0);
    assert.isNull(fetched.groupId);

    assert.equal(await queue.getJobState(job.id), 'waiting');
    assert.deepEqual(await queue.getJobStatus(job.id), { state: 'waiting', job: fetched });
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 1,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    });
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

  it('tracks delayed jobs in the delayed state', async () => {
    const job = await queue.add('later', {}, { delay: 60_000 });

    assert.equal(await queue.getJobState(job.id), 'delayed');
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

  it('pauses and resumes', async () => {
    assert.isFalse(await queue.isPaused());
    await queue.pause();
    assert.isTrue(await queue.isPaused());
    await queue.resume();
    assert.isFalse(await queue.isPaused());
  });

  it('drains waiting jobs', async () => {
    await queue.add('a', {});
    await queue.add('b', {}, { group: { id: 'g' } });
    await queue.add('c', {}, { delay: 60_000 });

    const removed = await queue.drain();
    assert.equal(removed, 2);
    let counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 0);
    assert.equal(counts.delayed, 1);

    await queue.add('d', {});
    const removedWithDelayed = await queue.drain(true);
    assert.equal(removedWithDelayed, 2);
    counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 0);
    assert.equal(counts.delayed, 0);
  });

  it('does not let glob characters in a prefix affect another queue', async () => {
    const prefix = `test-${randomUUID()}`;
    const wildcardQueue = new Queue('shared-name', { redisUrl, prefix: `${prefix}-*` });
    const otherQueue = new Queue('shared-name', { redisUrl, prefix: `${prefix}-other` });
    try {
      await wildcardQueue.add('wildcard', {});
      const otherJob = await otherQueue.add('other', {});

      await wildcardQueue.obliterate();

      assert.isNull(await wildcardQueue.getJob('1'));
      assert.isNotNull(await otherQueue.getJob(otherJob.id));
    } finally {
      await wildcardQueue.obliterate();
      await otherQueue.obliterate();
      await wildcardQueue.close();
      await otherQueue.close();
    }
  });

  it('returns unknown state for missing jobs', async () => {
    assert.equal(await queue.getJobState('does-not-exist'), 'unknown');
    assert.deepEqual(await queue.getJobStatus('does-not-exist'), {
      state: 'unknown',
      job: null,
    });
    assert.isNull(await queue.getJob('does-not-exist'));
  });

  it('rejects invalid job options', async () => {
    await expect(queue.add('', {})).rejects.toThrow('name');
    await expect(queue.add(42 as unknown as string, {})).rejects.toThrow('name');
    await expect(queue.add('bad', {}, { jobId: '123' })).rejects.toThrow('purely numeric');
    await expect(queue.add('bad', {}, { delay: -1 })).rejects.toThrow('delay');
    await expect(queue.add('bad', {}, { attempts: 0 })).rejects.toThrow('attempts');
    await expect(queue.add('bad', {}, { priority: -5 })).rejects.toThrow('priority');
    await expect(queue.add('bad', {}, { group: { id: '' } })).rejects.toThrow('group.id');
    await expect(queue.add('bad', {}, { backoff: -1 })).rejects.toThrow('backoff');
    await expect(queue.add('bad', {}, { removeOnComplete: 0 })).rejects.toThrow('removeOnComplete');
    await expect(
      queue.add('bad', {}, { removeOnComplete: 'all' } as unknown as JobOptions),
    ).rejects.toThrow('removeOnComplete');
    await expect(
      queue.add('bad', {}, { removeOnFail: null } as unknown as JobOptions),
    ).rejects.toThrow('removeOnFail');
    await expect(
      queue.add('bad', {}, { unexpected: true } as unknown as JobOptions),
    ).rejects.toThrow('Unknown job option');
  });

  it('rejects job data that cannot be stored as JSON', async () => {
    await expect(queue.add('bad', { value: 1n })).rejects.toThrow('bigint values');
    await expect(queue.add('bad', { value: undefined })).rejects.toThrow('undefined values');
    await expect(queue.add('bad', new Date())).rejects.toThrow('plain objects');

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
  });
});
