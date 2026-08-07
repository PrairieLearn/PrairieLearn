import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import type { Job } from './job.js';
import { Queue } from './queue.js';
import { Worker } from './worker.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/';

async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(25);
  }
  throw new Error('Timed out waiting for condition');
}

/** Resolves once the worker has completed `count` jobs. */
function completions(worker: Worker<any, any>, count: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0;
    worker.on('completed', () => {
      seen += 1;
      if (seen === count) resolve();
    });
  });
}

describe('Worker', () => {
  let queue: Queue<any, any>;
  let workers: Worker<any, any>[];

  function makeWorker(...args: ConstructorParameters<typeof Worker<any, any>>): Worker<any, any> {
    const worker = new Worker(...args);
    workers.push(worker);
    return worker;
  }

  beforeEach(() => {
    workers = [];
    queue = new Queue(`test-${randomUUID()}`, { redisUrl });
  });

  afterEach(async () => {
    for (const worker of workers) {
      await worker.close(true);
    }
    await queue.obliterate();
    await queue.close();
  });

  it('processes a job and records the result', async () => {
    await queue.add('greet', { name: 'world' });
    const worker = makeWorker(queue.name, async (job) => `hello ${job.data.name}`, {
      redisUrl,
      blockTimeout: 100,
    });

    const [job, result] = (await once(worker, 'completed')) as [Job, string];
    assert.equal(result, 'hello world');
    assert.equal(job.name, 'greet');
    assert.equal(job.attemptsMade, 1);

    assert.equal(await queue.getJobState(job.id), 'completed');
    const stored = await queue.getJob(job.id);
    assert.ok(stored);
    assert.equal(stored.returnvalue, 'hello world');
    assert.isNotNull(stored.processedOn);
    assert.isNotNull(stored.finishedOn);
    assert.deepEqual(await queue.getJobStatus(job.id), { state: 'completed', job: stored });
  });

  it('can wait until an explicitly started worker is ready', async () => {
    const worker = makeWorker(queue.name, async () => 'done', {
      redisUrl,
      autorun: false,
      blockTimeout: 50,
    });

    await expect(worker.waitUntilReady()).rejects.toThrow('call run()');
    worker.run();
    await worker.waitUntilReady();

    const completed = once(worker, 'completed');
    await queue.add('job', {});
    await completed;
  });

  it('processes jobs concurrently up to the concurrency limit', async () => {
    await queue.addBulk([1, 2, 3, 4].map((n) => ({ name: 'slow', data: n })));

    let active = 0;
    let maxActive = 0;
    const worker = makeWorker(
      queue.name,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(100);
        active -= 1;
      },
      { redisUrl, concurrency: 2, blockTimeout: 100 },
    );

    await completions(worker, 4);
    assert.equal(maxActive, 2);
  });

  it('round-robins across groups', async () => {
    for (const groupId of ['a', 'a', 'a', 'b', 'b', 'b']) {
      await queue.add('job', {}, { group: { id: groupId } });
    }

    const order: (string | null)[] = [];
    const worker = makeWorker(
      queue.name,
      async (job) => {
        order.push(job.groupId);
      },
      { redisUrl, blockTimeout: 100 },
    );

    await completions(worker, 6);
    assert.deepEqual(order, ['a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('orders jobs by priority within a group', async () => {
    await queue.pause();
    await queue.add('low-1', {}, { priority: 5 });
    await queue.add('high', {}, { priority: 0 });
    await queue.add('low-2', {}, { priority: 5 });

    const order: string[] = [];
    const worker = makeWorker(
      queue.name,
      async (job) => {
        order.push(job.name);
      },
      { redisUrl, blockTimeout: 100 },
    );
    await queue.resume();

    await completions(worker, 3);
    assert.deepEqual(order, ['high', 'low-1', 'low-2']);
  });

  it('waits for the delay before processing delayed jobs', async () => {
    const job = await queue.add('later', {}, { delay: 200 });
    const worker = makeWorker(queue.name, async () => 'done', { redisUrl, blockTimeout: 50 });

    await once(worker, 'completed');
    const stored = await queue.getJob(job.id);
    assert.ok(stored);
    assert.isNotNull(stored.processedOn);
    assert.isAtLeast(stored.processedOn - stored.timestamp, 200);
  });

  it('retries failing jobs and eventually moves them to failed', async () => {
    await queue.add('flaky', {}, { attempts: 3, backoff: { type: 'exponential', delay: 10 } });

    const retries: number[] = [];
    const worker = makeWorker(
      queue.name,
      async (job) => {
        retries.push(job.attemptsMade);
        throw new Error(`attempt ${job.attemptsMade} failed`);
      },
      { redisUrl, blockTimeout: 50 },
    );

    const [job, error] = (await once(worker, 'failed')) as [Job, Error];
    assert.deepEqual(retries, [1, 2, 3]);
    assert.equal(job.attemptsMade, 3);
    assert.equal(error.message, 'attempt 3 failed');
    assert.equal(await queue.getJobState(job.id), 'failed');
    const stored = await queue.getJob(job.id);
    assert.equal(stored?.failedReason, 'attempt 3 failed');
  });

  it('succeeds after a retry', async () => {
    await queue.add('flaky', {}, { attempts: 2 });

    const worker = makeWorker(
      queue.name,
      async (job) => {
        if (job.attemptsMade < 2) throw new Error('first attempt fails');
        return 'recovered';
      },
      { redisUrl, blockTimeout: 50 },
    );

    const retrying = once(worker, 'retrying');
    const [job, result] = (await once(worker, 'completed')) as [Job, string];
    await retrying;
    assert.equal(result, 'recovered');
    assert.equal(job.attemptsMade, 2);
  });

  it('limits concurrent jobs per group with groupConcurrency', async () => {
    for (const groupId of ['a', 'a', 'a', 'b', 'b', 'b']) {
      await queue.add('job', {}, { group: { id: groupId } });
    }

    const activePerGroup = new Map<string, number>();
    let maxPerGroup = 0;
    let maxTotal = 0;
    const worker = makeWorker(
      queue.name,
      async (job) => {
        const groupId = job.groupId ?? '';
        const current = (activePerGroup.get(groupId) ?? 0) + 1;
        activePerGroup.set(groupId, current);
        maxPerGroup = Math.max(maxPerGroup, current);
        maxTotal = Math.max(
          maxTotal,
          [...activePerGroup.values()].reduce((a, b) => a + b, 0),
        );
        await sleep(100);
        activePerGroup.set(groupId, current - 1);
      },
      { redisUrl, concurrency: 4, groupConcurrency: 1, blockTimeout: 50 },
    );

    await completions(worker, 6);
    assert.equal(maxPerGroup, 1);
    assert.isAtLeast(maxTotal, 2);
  });

  it('enforces groupConcurrency across multiple workers', async () => {
    await queue.addBulk(
      Array.from({ length: 8 }, (_, index) => ({
        name: 'job',
        data: index,
        options: { group: { id: 'shared' } },
      })),
    );

    let active = 0;
    let maxActive = 0;
    const processJob = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(100);
      active -= 1;
    };
    const firstWorker = makeWorker(queue.name, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 2,
      blockTimeout: 50,
    });
    const secondWorker = makeWorker(queue.name, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 2,
      blockTimeout: 50,
    });

    await Promise.all([firstWorker.waitUntilReady(), secondWorker.waitUntilReady()]);
    await waitUntil(async () => (await queue.getJobCounts()).completed === 8);
    assert.equal(maxActive, 2);
  });

  it('continues renewing locks while closing gracefully', async () => {
    const job = await queue.add('slow', {});
    let releaseProcessor!: () => void;
    const processorReleased = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });
    let markStarted!: () => void;
    const processorStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const worker = makeWorker(
      queue.name,
      async () => {
        markStarted();
        await processorReleased;
        return 'done';
      },
      { redisUrl, lockDuration: 150, blockTimeout: 50 },
    );
    await processorStarted;

    const closePromise = worker.close();
    let processedBySecondWorker = false;
    const secondWorker = makeWorker(
      queue.name,
      async () => {
        processedBySecondWorker = true;
        return 'duplicate';
      },
      { redisUrl, stalledInterval: 50, blockTimeout: 50 },
    );
    await secondWorker.waitUntilReady();

    await sleep(500);
    assert.isFalse(processedBySecondWorker);
    assert.equal(await queue.getJobState(job.id), 'active');

    releaseProcessor();
    await closePromise;
    await waitUntil(async () => (await queue.getJobState(job.id)) === 'completed');
    assert.isFalse(processedBySecondWorker);
  });

  it('recovers stalled jobs', async () => {
    const job = await queue.add('stall', {});

    const stuckWorker = makeWorker(queue.name, () => new Promise(() => {}), {
      redisUrl,
      lockDuration: 300,
      blockTimeout: 50,
    });
    await waitUntil(async () => (await queue.getJobState(job.id)) === 'active');
    await stuckWorker.close(true);

    const worker = makeWorker(queue.name, async () => 'recovered', {
      redisUrl,
      stalledInterval: 100,
      blockTimeout: 50,
    });
    const stalled = once(worker, 'stalled');
    const [completedJob, result] = (await once(worker, 'completed')) as [Job, string];
    await stalled;
    assert.equal(result, 'recovered');
    assert.equal(completedJob.id, job.id);
    assert.equal(completedJob.stalledCount, 1);
    assert.equal(completedJob.attemptsMade, 2);
  });

  it('applies failed-job retention when a stalled job exceeds its limit', async () => {
    const job = await queue.add('stall', {}, { removeOnFail: true });
    const stuckWorker = makeWorker(queue.name, () => new Promise(() => {}), {
      redisUrl,
      lockDuration: 150,
      blockTimeout: 50,
    });
    await waitUntil(async () => (await queue.getJobState(job.id)) === 'active');
    await stuckWorker.close(true);

    const worker = makeWorker(queue.name, async () => 'unexpected', {
      redisUrl,
      maxStalledCount: 0,
      stalledInterval: 50,
      blockTimeout: 50,
    });
    await once(worker, 'stalled');

    assert.isNull(await queue.getJob(job.id));
    assert.equal((await queue.getJobCounts()).failed, 0);
  });

  it('removes job data when removeOnComplete is set', async () => {
    const job = await queue.add('ephemeral', {}, { removeOnComplete: true });
    const worker = makeWorker(queue.name, async () => 'done', { redisUrl, blockTimeout: 50 });

    await once(worker, 'completed');
    assert.isNull(await queue.getJob(job.id));
    const counts = await queue.getJobCounts();
    assert.equal(counts.completed, 0);
  });

  it('retains only the configured number of completed jobs', async () => {
    const jobs = await queue.addBulk(
      [1, 2, 3].map((data) => ({ name: 'retained', data, options: { removeOnComplete: 2 } })),
    );
    const worker = makeWorker(queue.name, async () => 'done', { redisUrl, blockTimeout: 50 });

    await completions(worker, 3);
    const retained = await Promise.all(jobs.map(async (job) => await queue.getJob(job.id)));
    assert.lengthOf(
      retained.filter((job) => job != null),
      2,
    );
    assert.equal((await queue.getJobCounts()).completed, 2);
  });

  it('rejects invalid worker options', () => {
    const invalidOptions = [
      { groupConcurrency: -1 },
      { maxStalledCount: -1 },
      { stalledInterval: 0 },
      { blockTimeout: 0 },
    ];

    for (const options of invalidOptions) {
      const [name] = Object.keys(options);
      expect(() => new Worker(queue.name, async () => undefined, { redisUrl, ...options })).toThrow(
        name,
      );
    }
  });

  it('does not process jobs while the queue is paused', async () => {
    await queue.pause();
    await queue.add('patient', {});

    const worker = makeWorker(queue.name, async () => 'done', { redisUrl, blockTimeout: 50 });
    await sleep(300);
    let counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 1);
    assert.equal(counts.completed, 0);

    const completed = once(worker, 'completed');
    await queue.resume();
    await completed;
    counts = await queue.getJobCounts();
    assert.equal(counts.completed, 1);
  });
});
