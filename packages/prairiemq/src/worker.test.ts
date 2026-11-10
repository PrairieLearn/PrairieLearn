import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type AddressInfo, createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { Redis, ReplyError } from 'ioredis';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { withResolvers } from '@prairielearn/utils';

import { UnrecoverableError } from './errors.js';
import type { Job } from './job.js';
import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
import { Queue } from './queue.js';
import type { PrairieMQRedis } from './scripts.js';
import { realNowTimestamp } from './time.js';
import { MAX_TIMER_DELAY_MILLISECONDS, type WorkerOptions } from './types.js';
import { Worker } from './worker.js';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/';

async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 5000) {
  const start = realNowTimestamp();
  while (realNowTimestamp() - start < timeoutMs) {
    if (await fn()) return;
    await sleep(25);
  }
  throw new Error('Timed out waiting for condition');
}

async function waitForCompletedJobs(queue: Queue, count: number): Promise<void> {
  await waitUntil(async () => (await queue.getJobCounts()).completed === count);
}

async function redisTimestamp(client: PrairieMQRedis): Promise<number> {
  const [seconds, microseconds] = await client.time();
  return Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
}

async function waitForRedisConnection(client: Redis): Promise<void> {
  if (client.status === 'ready') return;
  await once(client, 'ready');
}

async function getUnusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

describe('Worker', () => {
  let queue: Queue<any, any>;
  let queueName: string;
  let queueBase: string;
  let workers: Worker<any, any>[];

  function makeWorker(
    name: string,
    processor: ConstructorParameters<typeof Worker<any, any>>[1],
    options: WorkerOptions & { testLockDuration?: number },
  ): Worker<any, any> {
    const { testLockDuration, ...workerOptions } = options;
    const shouldRun = workerOptions.autorun !== false;
    const needsTestOverrides = testLockDuration != null;
    const worker = new Worker(name, processor, {
      ...workerOptions,
      autorun: needsTestOverrides ? false : workerOptions.autorun,
    });
    if (needsTestOverrides) {
      Reflect.set(worker, 'lockDuration', testLockDuration);
      if (shouldRun) worker.run();
    }
    workers.push(worker);
    return worker;
  }

  async function setupBlockingWorker() {
    const worker = makeWorker(queueName, async () => 'done', { redisUrl, autorun: false });
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));
    await worker.preflight();
    const blpop = vi.spyOn(blockingClient, 'blpop');
    return { worker, blockingClient, errors, blpop };
  }

  beforeEach(async () => {
    workers = [];
    queueName = `test-${randomUUID()}`;
    queueBase = new QueueKeys(DEFAULT_PREFIX, queueName).base;
    queue = new Queue(queueName, { redisUrl });
    await queue.waitUntilReady();
  });

  afterEach(async () => {
    for (const worker of workers) {
      await worker.close(true);
    }
    await queue.obliterate();
    await queue.close();
  });

  it('rejects unsupported worker rate limiter options', () => {
    const limiter = { max: 1, duration: 100, key: 'external-counter' };
    expect(() => new Worker(queueName, async () => {}, { redisUrl, limiter })).toThrow(
      'Unknown limiter option "key"',
    );
  });

  it('processes a job and records the result', async () => {
    const queuedJob = await queue.add('greet', { name: 'world' });
    makeWorker(queueName, async (job) => `hello ${job.data.name}`, { redisUrl });

    await waitUntil(async () => (await queue.getJobStatus(queuedJob.id)).state === 'completed');
    const status = await queue.getJobStatus(queuedJob.id);
    assert.equal(status.job?.name, 'greet');
    assert.equal(status.job?.returnvalue, 'hello world');
  });

  it('processes recurring jobs from a scheduler', async () => {
    await queue.upsertJobScheduler(
      'heartbeat',
      { every: 100 },
      { name: 'heartbeat', data: { source: 'scheduler' }, options: { removeOnComplete: true } },
    );
    const processed: string[] = [];
    makeWorker(
      queueName,
      async (job) => {
        assert.deepEqual(job.data, { source: 'scheduler' });
        processed.push(job.id);
      },
      { redisUrl },
    );

    await waitUntil(async () => processed.length >= 2);

    assert.notEqual(processed[0], processed[1]);
  });

  it('does not lose a scheduled occurrence when its former deterministic id exists', async () => {
    await queue.upsertJobScheduler(
      'heartbeat',
      { every: 100 },
      { name: 'heartbeat', data: { source: 'scheduler' } },
    );
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const dueAt = await client.zscore(`${queueBase}:schedulers`, 'heartbeat');
    assert.isNotNull(dueAt);
    await queue.add('collision', {}, { jobId: `scheduler:heartbeat:${Math.trunc(Number(dueAt))}` });
    await waitUntil(async () => (await redisTimestamp(client)) >= Number(dueAt));

    const reply = await client.pmqMoveToActive(
      queueBase,
      randomUUID(),
      await redisTimestamp(client),
      1,
      randomUUID(),
      30_000,
      0,
      1,
      'claim',
    );

    assert.isNotNull(reply);
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 1,
      active: 1,
      delayed: 0,
      completed: 0,
      failed: 0,
    });
  });

  it('removes a deduplication key with ephemeral job data', async () => {
    const job = await queue.add(
      'ephemeral',
      {},
      { deduplication: { id: 'ephemeral' }, removeOnComplete: true },
    );
    makeWorker(queueName, async () => 'done', { redisUrl });

    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'unknown');

    assert.isNull(await queue.getDeduplicationJobId('ephemeral'));
  });

  it('cleans up an adopted deduplication key using the job hash metadata', async () => {
    const original = await queue.add(
      'ephemeral',
      {},
      { jobId: 'stable-job', removeOnComplete: true },
    );
    await queue.add(
      'ignored',
      {},
      { jobId: original.id, deduplication: { id: 'adopted' }, removeOnComplete: false },
    );
    makeWorker(queueName, async () => 'done', { redisUrl });

    await waitUntil(async () => (await queue.getJobStatus(original.id)).state === 'unknown');

    assert.isNull(await queue.getDeduplicationJobId('adopted'));
  });

  it('atomically deduplicates follow-up jobs behind active work', async () => {
    const firstJob = await queue.addDeduplicatedUntilActive('task', { attempt: 1 }, 'shared-task');
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    makeWorker(
      queueName,
      async (job) => {
        if (job.id === firstJob.id) {
          notifyStarted();
          await firstReleased;
        }
      },
      { redisUrl },
    );
    await started;

    try {
      const followUps = await Promise.all([
        queue.addDeduplicatedUntilActive('task', { attempt: 2 }, 'shared-task'),
        queue.addDeduplicatedUntilActive('task', { attempt: 3 }, 'shared-task'),
      ]);

      assert.equal(followUps[0].id, followUps[1].id);
      assert.notEqual(followUps[0].id, firstJob.id);
      assert.deepEqual(await queue.getJobCounts(), {
        waiting: 1,
        active: 1,
        delayed: 0,
        completed: 0,
        failed: 0,
      });
    } finally {
      releaseFirst();
    }
    await waitForCompletedJobs(queue, 2);
  });

  it('deduplicates active work until it finishes', async () => {
    const firstJob = await queue.addDeduplicatedUntilFinished(
      'task',
      { attempt: 1 },
      'shared-task',
    );
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    makeWorker(
      queueName,
      async (job) => {
        if (job.id === firstJob.id) {
          notifyStarted();
          await firstReleased;
        }
      },
      { redisUrl },
    );
    await started;

    const duplicate = await queue.addDeduplicatedUntilFinished(
      'task',
      { attempt: 2 },
      'shared-task',
    );
    assert.equal(duplicate.id, firstJob.id);
    assert.deepEqual(duplicate.data, { attempt: 1 });

    releaseFirst();
    await waitForCompletedJobs(queue, 1);

    const nextJob = await queue.addDeduplicatedUntilFinished('task', { attempt: 3 }, 'shared-task');
    assert.notEqual(nextJob.id, firstJob.id);
    await waitForCompletedJobs(queue, 2);
  });

  it('records a void processor result as null', async () => {
    const queuedJob = await queue.add('no-result', {});
    makeWorker(queueName, async () => undefined, { redisUrl });

    await waitForCompletedJobs(queue, 1);

    const status = await queue.getJobStatus(queuedJob.id);
    assert.equal(status.job?.returnvalue, null);
  });

  it('fails without rerunning a processor whose result cannot be stored as JSON', async () => {
    const queuedJob = await queue.add('invalid-result', {}, { attempts: 3 });
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        return 1n;
      },
      { redisUrl, testLockDuration: 100, stalledInterval: 50 },
    );

    const [failedJob, error] = (await once(worker, 'failed')) as [Job, Error];
    assert.equal(failedJob.id, queuedJob.id);
    assert.equal(
      error.message,
      'Job result contains an invalid JSON value at $: bigint values are not allowed',
    );
    assert.equal(processorRuns, 1);
    assert.equal((await queue.getJobStatus(queuedJob.id)).state, 'failed');
  });

  it('can wait until an explicitly started worker is ready', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });

    await expect(worker.waitUntilReady()).rejects.toThrow('call run()');
    worker.run();
    await worker.waitUntilReady();

    await queue.add('job', {});
    await waitForCompletedJobs(queue, 1);
  });

  it('preflights a worker without claiming a job', async () => {
    const job = await queue.add('job', {});
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
      },
      { redisUrl, autorun: false },
    );
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    const blpop = vi.spyOn(blockingClient, 'blpop');

    await worker.preflight();

    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
    assert.equal(processorRuns, 0);
    expect(blpop).toHaveBeenCalledOnce();

    worker.run();
    await worker.waitUntilReady();
    await waitForCompletedJobs(queue, 1);
    assert.equal(processorRuns, 1);
  });

  it('does not start timers after closing during startup', async () => {
    const worker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as {
      pmqConfigureGroupConcurrency: (prefix: string, groupConcurrency: number) => Promise<number>;
    };
    let markConfigurationStarted!: () => void;
    const configurationStarted = new Promise<void>((resolve) => {
      markConfigurationStarted = resolve;
    });
    let finishConfiguration!: (configured: number) => void;
    const configurationFinished = new Promise<number>((resolve) => {
      finishConfiguration = resolve;
    });
    vi.spyOn(client, 'pmqConfigureGroupConcurrency').mockImplementation(() => {
      markConfigurationStarted();
      return configurationFinished;
    });

    worker.run();
    await configurationStarted;
    const closePromise = worker.close();
    finishConfiguration(0);
    await closePromise;

    assert.isNull(Reflect.get(worker, 'lockTimer'));
    assert.isNull(Reflect.get(worker, 'stalledTimer'));
  });

  it('rejects unsupported Redis versions during startup', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await Promise.all([waitForRedisConnection(client), waitForRedisConnection(blockingClient)]);
    vi.spyOn(client, 'info').mockResolvedValue('# Server\r\nredis_version:6.0.20\r\n');
    worker.on('error', () => {});

    worker.run();

    await expect(worker.waitUntilReady()).rejects.toThrow(
      'PrairieMQ requires Redis 6.2.0 or later; connected server is 6.0.20',
    );
  });

  it('retries a transient Redis version check failure', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await Promise.all([waitForRedisConnection(client), waitForRedisConnection(blockingClient)]);
    const loadingError = new ReplyError('LOADING Redis is loading the dataset in memory');
    const info = vi
      .spyOn(client, 'info')
      .mockRejectedValueOnce(loadingError)
      .mockResolvedValue('# Server\r\nredis_version:6.2.0\r\n');
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    worker.run();
    await worker.waitUntilReady();

    expect(info).toHaveBeenCalledTimes(2);
    assert.deepEqual(errors, [loadingError]);
    await queue.add('job', {});
    await waitForCompletedJobs(queue, 1);
  });

  it('fails startup on a permanent Redis command error', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await Promise.all([waitForRedisConnection(client), waitForRedisConnection(blockingClient)]);
    const error = new ReplyError("NOPERM User worker has no permissions to run the 'info' command");
    const info = vi.spyOn(client, 'info').mockRejectedValue(error);
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    worker.run();

    await expect(worker.waitUntilReady()).rejects.toThrow(error.message);
    expect(info).toHaveBeenCalledOnce();
    assert.deepEqual(errors, [error]);
    assert.isNull(Reflect.get(worker, 'lockTimer'));
    assert.isNull(Reflect.get(worker, 'stalledTimer'));
  });

  it.each([
    "ERR Error running script (call to f_123): @user_script:1: The user executing the script can't run this command or subcommand",
    "ERR The user executing the script can't publish to the channel mentioned in the command script: abc, on @user_script:1.",
    "ERR ACL failure in script: User worker has no permissions to run the 'hget' command script: abc, on @user_script:1.",
    'ERR Error running script (call to f_123): @user_script:1: WRONGTYPE Operation against a key holding the wrong kind of value',
    'ERR Error running script (call to f_123): @user_script:1: Lua script attempted to access a non local key in a cluster node',
  ])('fails startup on a permanent Redis script error', async (message) => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await Promise.all([waitForRedisConnection(client), waitForRedisConnection(blockingClient)]);
    const error = new ReplyError(message);
    const configure = vi.spyOn(client, 'pmqConfigureGroupConcurrency').mockRejectedValue(error);
    const errors: Error[] = [];
    worker.on('error', (emittedError) => errors.push(emittedError));

    worker.run();

    await expect(worker.waitUntilReady()).rejects.toThrow(message);
    expect(configure).toHaveBeenCalledOnce();
    assert.deepEqual(errors, [error]);
  });

  it('revalidates both Redis connections after they reconnect', async () => {
    const worker = makeWorker(queueName, async () => 'done', { redisUrl });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await worker.waitUntilReady();

    Reflect.set(client.options, 'db', 1);
    Reflect.set(blockingClient.options, 'db', 1);
    const selectScriptedDatabase = vi.spyOn(client, 'select').mockResolvedValue('OK');
    const selectBlockingDatabase = vi.spyOn(blockingClient, 'select').mockResolvedValue('OK');

    client.emit('close');
    blockingClient.emit('close');
    await queue.add('job', {});
    await waitForCompletedJobs(queue, 1);

    expect(selectScriptedDatabase).toHaveBeenCalledWith(1);
    expect(selectBlockingDatabase).toHaveBeenCalledWith(1);
  });

  it('accepts a blocking reply delayed beyond the polling timeout', async () => {
    const { worker, blockingClient, errors, blpop } = await setupBlockingWorker();
    const stream = blockingClient.stream;
    stream.pause();

    let completed = false;
    const preflight = worker.preflight().then(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(blpop).toHaveBeenCalledOnce());
    await sleep(250);
    assert.isFalse(completed);
    stream.resume();
    await preflight;

    assert.strictEqual(blockingClient.stream, stream);
    assert.deepEqual(errors, []);
  });

  it.each([
    {
      timeout: 'command',
      commandTimeout: 500,
      socketTimeout: 10_000,
      expectedError: 'Command timed out',
    },
    {
      timeout: 'socket',
      commandTimeout: 2000,
      socketTimeout: 500,
      expectedError: "Socket timeout. Expecting data, but didn't receive any in 500ms.",
    },
  ])(
    'reconnects a blocking connection after a $timeout timeout',
    async ({ commandTimeout, socketTimeout, expectedError }) => {
      const { worker, blockingClient, errors, blpop } = await setupBlockingWorker();
      worker.once('error', () => {
        blockingClient.options.socketTimeout = 10_000;
        blockingClient.options.commandTimeout = 10_000;
      });
      // Time out before Redis's one-second poll ends, leaving a real
      // server-side wait that reconnection must cancel.
      blockingClient.options.socketTimeout = socketTimeout;
      blockingClient.options.commandTimeout = commandTimeout;
      const blockedStream = blockingClient.stream;
      const reconnected = new Promise<void>((resolve) => blockingClient.once('ready', resolve));
      worker.run();
      await worker.waitUntilReady();
      await vi.waitFor(() => expect(blpop).toHaveBeenCalledOnce());

      blockedStream.pause();

      await reconnected;
      assert.notStrictEqual(blockingClient.stream, blockedStream);
      assert.isTrue(blockedStream.destroyed);
      assert.deepEqual(
        errors.map((error) => error.message),
        [expectedError],
      );
      const job = await queue.add('job', {});
      await waitForCompletedJobs(queue, 1);
      assert.equal((await queue.getJobStatus(job.id)).job?.returnvalue, 'done');
    },
  );

  it('does not complete preflight without a complete blocking response', async () => {
    const { worker, blockingClient, blpop } = await setupBlockingWorker();
    const blockedStream = blockingClient.stream;
    blockedStream.pause();

    const preflight = worker.preflight();
    await vi.waitFor(() => expect(blpop).toHaveBeenCalledOnce());
    blockedStream.emit('data', Buffer.from('*'));
    const completedWithoutResponse = await Promise.race([
      preflight.then(() => true),
      sleep(200).then(() => false),
    ]);

    assert.isFalse(completedWithoutResponse);
    blockedStream.emit('data', Buffer.from('-1\r\n'));
    await preflight;
  });

  it('does not close a replacement connection when an old blocking command fails', async () => {
    const { worker, blockingClient, errors, blpop } = await setupBlockingWorker();

    const { promise, reject: rejectBlockingPop } = withResolvers<[string, string] | null>();
    blpop.mockReturnValueOnce(promise);
    const preflight = worker.preflight();
    await vi.waitFor(() => expect(blpop).toHaveBeenCalledOnce());
    const oldStream = blockingClient.stream;
    const reconnected = once(blockingClient, 'ready');
    oldStream.destroy();
    await reconnected;
    const newStream = blockingClient.stream;

    const error = new Error('Late failure from the old connection');
    rejectBlockingPop(error);
    await preflight;

    assert.strictEqual(blockingClient.stream, newStream);
    assert.deepEqual(errors, [error]);
  });

  it('restarts blocking database verification if the connection closes during SELECT', async () => {
    const worker = makeWorker(queueName, async () => 'done', { redisUrl });
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    await worker.waitUntilReady();

    Reflect.set(blockingClient.options, 'db', 1);
    let finishOldSelect!: (result: 'OK') => void;
    const oldSelectFinished = new Promise<'OK'>((resolve) => {
      finishOldSelect = resolve;
    });
    const select = vi
      .spyOn(blockingClient, 'select')
      .mockReturnValueOnce(oldSelectFinished)
      .mockResolvedValue('OK');

    blockingClient.emit('close');
    await queue.add('job', {});
    await vi.waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    blockingClient.emit('close');
    finishOldSelect('OK');

    await waitForCompletedJobs(queue, 1);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('does not fetch from an unverified database after reconnecting', async () => {
    const worker = makeWorker(queueName, async () => 'done', { redisUrl });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));
    await worker.waitUntilReady();

    assert.isFalse(client.options.enableOfflineQueue);
    assert.isFalse(blockingClient.options.enableOfflineQueue);
    assert.isFalse(blockingClient.options.autoResendUnfulfilledCommands);
    assert.equal(blockingClient.options.commandTimeout, 10_000);

    Reflect.set(blockingClient.options, 'db', 1);
    const error = new ReplyError('ERR DB index is out of range');
    vi.spyOn(blockingClient, 'select').mockRejectedValue(error);
    const fetch = vi.spyOn(client, 'pmqMoveToActive');

    blockingClient.emit('close');
    const job = await queue.add('job', {});
    await waitUntil(async () => errors.includes(error));

    expect(fetch).not.toHaveBeenCalled();
    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
    await expect(worker.waitUntilReady()).rejects.toThrow(error.message);
  });

  it('does not finalize a job until a reconnected client is revalidated', async () => {
    const job = await queue.add('job', {});
    let markProcessorStarted!: () => void;
    const processorStarted = new Promise<void>((resolve) => {
      markProcessorStarted = resolve;
    });
    let finishProcessor!: () => void;
    const processorFinished = new Promise<void>((resolve) => {
      finishProcessor = resolve;
    });
    const worker = makeWorker(
      queueName,
      async () => {
        markProcessorStarted();
        await processorFinished;
        return 'done';
      },
      { redisUrl },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    await processorStarted;

    let finishVersionCheck!: (info: string) => void;
    const versionCheckFinished = new Promise<string>((resolve) => {
      finishVersionCheck = resolve;
    });
    const info = vi.spyOn(client, 'info').mockReturnValue(versionCheckFinished);
    const complete = vi.spyOn(client, 'pmqMoveToCompleted');
    client.emit('close');
    finishProcessor();

    await waitUntil(async () => info.mock.calls.length === 1);
    expect(complete).not.toHaveBeenCalled();
    finishVersionCheck('# Server\r\nredis_version:6.2.0\r\n');

    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'completed');
    expect(complete).toHaveBeenCalledOnce();
  });

  it('closes after a permanent marker-wait error instead of retrying it', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    const error = new ReplyError(
      "NOPERM User worker has no permissions to run the 'blpop' command",
    );
    const blpop = vi.spyOn(blockingClient, 'blpop').mockRejectedValue(error);
    const errors: Error[] = [];
    worker.on('error', (emittedError) => errors.push(emittedError));

    worker.run();
    await waitUntil(async () => errors.includes(error));

    expect(blpop).toHaveBeenCalledOnce();
    await expect(worker.waitUntilReady()).rejects.toThrow(error.message);
  });

  it('closes after a permanent finalization error without taking another job', async () => {
    const jobs = await queue.addBulk([
      { name: 'first', data: {} },
      { name: 'second', data: {} },
    ]);
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        return 'done';
      },
      { redisUrl, autorun: false },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const error = new ReplyError(
      "ERR ACL failure in script: User worker has no permissions to run the 'zadd' command script: abc, on @user_script:1.",
    );
    const complete = vi.spyOn(client, 'pmqMoveToCompleted').mockRejectedValue(error);
    const errors: Error[] = [];
    worker.on('error', (emittedError) => errors.push(emittedError));

    worker.run();
    await waitUntil(async () => errors.includes(error));

    expect(complete).toHaveBeenCalledOnce();
    assert.equal(processorRuns, 1);
    assert.equal((await queue.getJobStatus(jobs[0].id)).state, 'active');
    assert.equal((await queue.getJobStatus(jobs[1].id)).state, 'waiting');
    await expect(worker.waitUntilReady()).rejects.toThrow(error.message);
  });

  it('reports a permanent connection error before an unstarted worker', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const error = new ReplyError('WRONGPASS invalid username-password pair');
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    client.emit('error', error);

    await expect(worker.waitUntilReady()).rejects.toThrow(error.message);
    assert.deepEqual(errors, [error]);
  });

  it('processes jobs concurrently up to the concurrency limit', async () => {
    await queue.addBulk([1, 2, 3, 4].map((n) => ({ name: 'slow', data: n })));

    let active = 0;
    let maxActive = 0;
    makeWorker(
      queueName,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(100);
        active -= 1;
      },
      { redisUrl, concurrency: 2 },
    );

    await waitForCompletedJobs(queue, 4);
    assert.equal(maxActive, 2);
  });

  it('round-robins across groups', async () => {
    for (const groupId of ['a', 'a', 'a', 'b', 'b', 'b']) {
      await queue.add('job', {}, { group: { id: groupId } });
    }

    const order: (string | null)[] = [];
    makeWorker(
      queueName,
      async (job) => {
        order.push(job.groupId);
      },
      { redisUrl },
    );

    await waitForCompletedJobs(queue, 6);
    assert.deepEqual(order, ['a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('removes idle groups from rotation membership and can add them again', async () => {
    await queue.add('first', {}, { group: { id: 'group' } });
    const worker = makeWorker(queueName, async () => undefined, { redisUrl });

    await waitForCompletedJobs(queue, 1);
    await worker.close();
    const client = Reflect.get(queue, 'client') as {
      lrange: (key: string, start: number, stop: number) => Promise<string[]>;
      smembers: (key: string) => Promise<string[]>;
    };
    assert.deepEqual(await client.lrange(`${queueBase}:groups`, 0, -1), []);
    assert.deepEqual(await client.smembers(`${queueBase}:group-members`), []);

    await queue.add('second', {}, { group: { id: 'group' } });
    assert.deepEqual(await client.lrange(`${queueBase}:groups`, 0, -1), ['group']);
    assert.deepEqual(await client.smembers(`${queueBase}:group-members`), ['group']);
  });

  it('preserves FIFO order after 2^32 queue enqueues', async () => {
    const client = Reflect.get(queue, 'client') as {
      set: (key: string, value: number) => Promise<string>;
    };
    await client.set(`${queueBase}:seq`, 2 ** 32 - 2);
    await queue.add('job', 'first', { group: { id: 'group' } });
    await queue.add('job', 'second', { group: { id: 'group' } });

    const order: string[] = [];
    makeWorker(
      queueName,
      async (job) => {
        order.push(job.data);
      },
      { redisUrl },
    );

    await waitForCompletedJobs(queue, 2);
    assert.deepEqual(order, ['first', 'second']);
  });

  it('orders priorities within groups while preserving group fairness and FIFO ties', async () => {
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    await client.set(`${queueBase}:priority-seq`, Number.MAX_SAFE_INTEGER.toString());
    await queue.addBulk(
      [
        { name: 'a-low', priority: 100, group: 'a' },
        { name: 'a-high-first', priority: 1, group: 'a' },
        { name: 'a-high-second', priority: 1, group: 'a' },
        { name: 'a-default', priority: 0, group: 'a' },
        { name: 'b-low', priority: 100, group: 'b' },
        { name: 'b-high', priority: 1, group: 'b' },
        { name: 'b-default', priority: 0, group: 'b' },
      ].map(({ name, priority, group }) => ({
        name,
        data: {},
        options: { priority, group: { id: group } },
      })),
    );
    assert.equal((await queue.getJobCounts()).waiting, 7);
    assert.deepEqual(await queue.getGroups(), [
      { id: 'a', waiting: 4, active: 0 },
      { id: 'b', waiting: 3, active: 0 },
    ]);
    const order: string[] = [];
    makeWorker(queueName, async (job) => void order.push(job.name), { redisUrl });
    await waitForCompletedJobs(queue, 7);
    assert.deepEqual(order, [
      'a-default',
      'b-default',
      'a-high-first',
      'b-high',
      'a-high-second',
      'b-low',
      'a-low',
    ]);
    assert.deepEqual(await queue.getGroups(), []);
  });

  it('deduplicates prioritized waiting jobs until they become active', async () => {
    const first = await queue.addDeduplicatedUntilActive('first', {}, 'same', { priority: 5 });
    const second = await queue.addDeduplicatedUntilActive('second', {}, 'same', { priority: 1 });
    assert.equal(first.id, second.id);
    assert.equal((await queue.getJobStatus(first.id)).state, 'waiting');
    assert.equal((await queue.getJobCounts()).waiting, 1);
  });

  it('preserves priority through delayed retries and stalled recovery', async () => {
    const high = await queue.add('high', {}, { priority: 1, delay: 60_000, attempts: 2 });
    const low = await queue.add('low', {}, { priority: 100 });
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const [delayedMember] = await client.zrange(`${queueBase}:delayed`, '0', '-1');
    await client.zadd(`${queueBase}:delayed`, 0, delayedMember);
    const workerId = randomUUID();
    const startedAt = await redisTimestamp(client);
    let sequence = 0;
    const claim = (token: string) =>
      client.pmqMoveToActive(
        queueBase,
        workerId,
        startedAt,
        ++sequence,
        token,
        30_000,
        0,
        1,
        'claim',
      );
    const token = randomUUID();
    const first = await claim(token);
    assert.equal(first?.[first.indexOf('id') + 1], high.id);
    await client.pmqMoveToFailed(queueBase, high.id, token, 1, 60_000, 0);
    const [retryMember] = await client.zrange(`${queueBase}:delayed`, '0', '-1');
    await client.zadd(`${queueBase}:delayed`, 0, retryMember);
    const retry = await claim(randomUUID());
    assert.equal(retry?.[retry.indexOf('id') + 1], high.id);
    await client.del(`${queueBase}:lock:${high.id}`);
    assert.deepEqual(
      await client.pmqCheckStalled(queueBase, await redisTimestamp(client), 30_000),
      [[high.id], []],
    );
    const recovered = await claim(randomUUID());
    assert.equal(recovered?.[recovered.indexOf('id') + 1], high.id);
    assert.equal((await queue.getJobStatus(low.id)).state, 'waiting');
  });

  it('shares the limiter atomically across fetch sessions without counting replayed claims', async () => {
    await queue.addBulk(Array.from({ length: 4 }, () => ({ name: 'job', data: {} })));
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const startedAt = await redisTimestamp(client);
    const claim = (workerId: string, sequence: number, token: string) =>
      client.pmqMoveToActive(
        queueBase,
        workerId,
        startedAt,
        sequence,
        token,
        30_000,
        0,
        1,
        'claim',
        2,
        60_000,
      );
    const firstWorkerId = randomUUID();
    const firstToken = randomUUID();
    const first = await claim(firstWorkerId, 1, firstToken);
    const replay = await claim(firstWorkerId, 1, firstToken);
    assert.deepEqual(replay, first);
    const results = await Promise.all([
      claim(randomUUID(), 1, randomUUID()),
      claim(randomUUID(), 1, randomUUID()),
      claim(randomUUID(), 1, randomUUID()),
    ]);
    assert.equal(results.filter((reply) => reply?.[0] === 'job').length, 1);
    assert.equal(results.filter((reply) => reply?.[0] === 'delayed').length, 2);
    assert.equal(await client.get(`${queueBase}:limiter`), '2');
    assert.isAbove(await client.pttl(`${queueBase}:limiter`), 0);
    assert.equal((await queue.getJobCounts()).waiting, 2);
    await client.pexpire(`${queueBase}:limiter`, 0);
    assert.equal((await claim(randomUUID(), 1, randomUUID()))?.[0], 'job');
    assert.equal(await client.get(`${queueBase}:limiter`), '1');
  });

  it('resumes workers after the shared rate limit expires', async () => {
    await queue.addBulk(Array.from({ length: 4 }, () => ({ name: 'job', data: {} })));
    const processedAt: number[] = [];
    for (let index = 0; index < 2; index++) {
      makeWorker(queueName, async () => void processedAt.push(realNowTimestamp()), {
        redisUrl,
        concurrency: 2,
        limiter: { max: 2, duration: 300 },
      });
    }
    await waitForCompletedJobs(queue, 4);
    assert.isAtLeast(processedAt[2] - processedAt[0], 280);
  });

  it('updates the shared limiter without dropping jobs or resetting its current budget', async () => {
    await queue.addBulk(Array.from({ length: 5 }, () => ({ name: 'job', data: {} })));
    await queue.setRateLimit({ max: 1, duration: 60_000 });
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const startedAt = await redisTimestamp(client);
    const claim = () =>
      client.pmqMoveToActive(
        queueBase,
        randomUUID(),
        startedAt,
        1,
        randomUUID(),
        30_000,
        0,
        1,
        'claim',
      );
    assert.equal((await claim())?.[0], 'job');
    assert.equal((await claim())?.[0], 'delayed');
    await queue.setRateLimit({ max: 2, duration: 30_000 });
    assert.isAbove(await client.pttl(`${queueBase}:limiter`), 30_000);
    assert.equal((await claim())?.[0], 'job');
    assert.equal((await claim())?.[0], 'delayed');
    assert.equal(await client.get(`${queueBase}:limiter`), '2');
    assert.equal((await queue.getJobCounts()).waiting, 3);
    assert.equal((await queue.getJobCounts()).active, 2);
    await client.pexpire(`${queueBase}:limiter`, 0);
    assert.equal((await claim())?.[0], 'job');
    assert.isAtMost(await client.pttl(`${queueBase}:limiter`), 30_000);
    await queue.setRateLimit(null);
    assert.equal((await claim())?.[0], 'job');
    assert.equal((await claim())?.[0], 'job');
    assert.equal((await queue.getJobCounts()).active, 5);
  });

  it('waits for the delay before processing delayed jobs', async () => {
    const addedAt = realNowTimestamp();
    const job = await queue.add('later', {}, { delay: 200 });
    let processedAt: number | null = null;
    makeWorker(
      queueName,
      async () => {
        processedAt = realNowTimestamp();
        return 'done';
      },
      { redisUrl },
    );

    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'completed');
    assert.isNumber(processedAt);
    assert.isAtLeast(processedAt! - addedAt, 200);
  });

  it('uses Redis time for delays when application clocks differ', async () => {
    const actualNow = realNowTimestamp();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(actualNow - 60 * 60 * 1000);
    let job: Job;
    try {
      job = await queue.add('later', {}, { delay: 30_000 });
    } finally {
      dateNow.mockRestore();
    }

    const worker = makeWorker(queueName, async () => undefined, { redisUrl });
    await worker.waitUntilReady();

    assert.equal((await queue.getJobStatus(job.id)).state, 'delayed');
  });

  it('preserves equal-due scheduling order across delayed promotion batches', async () => {
    const delay = 60_000;
    const ids = [
      'z-oldest',
      ...Array.from({ length: 999 }, (_, index) => `m-${index.toString().padStart(4, '0')}`),
      'a-newest',
    ];
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    await client.set(`${queueBase}:delayed-seq`, Number.MAX_SAFE_INTEGER.toString());
    await queue.addBulk(
      ids.slice(0, 1000).map((jobId) => ({
        name: 'delayed',
        data: {},
        options: { jobId, delay, group: { id: 'group' } },
      })),
    );
    await queue.add(
      'delayed',
      {},
      {
        jobId: ids[1000],
        delay,
        group: { id: 'group' },
      },
    );
    const delayedMembers = await client.zrange(`${queueBase}:delayed`, '0', '-1');
    await client.zadd(`${queueBase}:delayed`, ...delayedMembers.flatMap((member) => [0, member]));

    const reply = await client.pmqMoveToActive(
      queueBase,
      randomUUID(),
      await redisTimestamp(client),
      1,
      randomUUID(),
      30_000,
      0,
      1,
      'claim',
    );

    assert.equal(reply?.[reply.indexOf('id') + 1], ids[0]);
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 999,
      active: 1,
      delayed: 1,
      completed: 0,
      failed: 0,
    });
    assert.equal((await queue.getJobStatus(ids[1000])).state, 'delayed');
  });

  it('preserves scheduling order for retries with the same due time', async () => {
    const ids = ['z-retried-first', 'a-retried-second'];
    await queue.addBulk(
      ids.map((jobId) => ({
        name: 'retry',
        data: {},
        options: { jobId, attempts: 2, group: { id: 'group' } },
      })),
    );

    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const workerId = randomUUID();
    const sessionStartedAt = await redisTimestamp(client);
    const tokens: string[] = [];
    for (const [index, jobId] of ids.entries()) {
      const token = randomUUID();
      tokens.push(token);
      const reply = await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        index + 1,
        token,
        30_000,
        0,
        1,
        'claim',
      );
      assert.equal(reply?.[reply.indexOf('id') + 1], jobId);
    }

    for (const [index, jobId] of ids.entries()) {
      assert.equal(await client.pmqMoveToFailed(queueBase, jobId, tokens[index], 1, 100, 0), 1);
      assert.equal((await queue.getJobStatus(jobId)).state, 'delayed');
    }
    const delayedMembers = await client.zrange(`${queueBase}:delayed`, '0', '-1');
    await client.zadd(`${queueBase}:delayed`, ...delayedMembers.flatMap((member) => [0, member]));

    for (const [index, jobId] of ids.entries()) {
      const reply = await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        index + 3,
        randomUUID(),
        30_000,
        0,
        1,
        'claim',
      );
      assert.equal(reply?.[reply.indexOf('id') + 1], jobId);
    }
  });

  it('retries failing jobs and eventually moves them to failed', async () => {
    await queue.add('flaky', {}, { attempts: 3, backoff: { type: 'fixed', delay: 10 } });

    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        throw new Error(`attempt ${processorRuns} failed`);
      },
      { redisUrl },
    );

    const [job, error] = (await once(worker, 'failed')) as [Job, Error];
    assert.equal(processorRuns, 3);
    assert.equal(job.failedAttempts, 3);
    assert.equal(error.message, 'attempt 3 failed');
    const status = await queue.getJobStatus(job.id);
    assert.equal(status.state, 'failed');
    assert.equal(status.job?.failedAttempts, 3);
  });

  it.each([
    { type: 'fixed' as const, jitter: 0.5, expected: [1500, 1500] },
    { type: 'exponential' as const, jitter: 0, expected: [2000, 4000] },
    { type: 'exponential' as const, jitter: 0.5, expected: [1500, 3000] },
  ])('persists $type retry due times with jitter $jitter', async ({ type, jitter, expected }) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const job = await queue.add(
      'retry',
      {},
      { attempts: 3, backoff: { type, delay: 2000, jitter } },
    );
    const starts: number[] = [];
    makeWorker(
      queueName,
      async () => {
        starts.push(await redisTimestamp(client));
        await queue.pause();
        throw new Error('retry');
      },
      { redisUrl },
    );
    try {
      for (const [index, delay] of expected.entries()) {
        await waitUntil(async () => {
          const status = await queue.getJobStatus(job.id);
          return status.state === 'delayed' && status.job?.failedAttempts === index + 1;
        });
        const member = await client.hget(`${queueBase}:job:${job.id}`, 'delayedMember');
        assert.isNotNull(member);
        const due = Number(await client.zscore(`${queueBase}:delayed`, member));
        assert.isAtLeast(due, starts[index] + delay);
        assert.isAtMost(due, (await redisTimestamp(client)) + delay);
        await queue.resume();
        await sleep(50);
        assert.equal(starts.length, index + 1);
        assert.equal((await queue.getJobStatus(job.id)).state, 'delayed');
        await client.zadd(`${queueBase}:delayed`, 0, member);
      }
      await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'failed');
      assert.equal(starts.length, 3);
      assert.equal((await queue.getJobStatus(job.id)).job?.failedAttempts, 3);
    } finally {
      random.mockRestore();
    }
  });

  it('stores retry due times beyond the Node.js timer limit in Redis', async () => {
    // Node timers overflow at about 25 days; Redis must retain the full due time.
    const delay = 30 * 24 * 60 * 60 * 1000;
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const before = await redisTimestamp(client);
    const job = await queue.add(
      'long-retry',
      {},
      { attempts: 2, backoff: { type: 'fixed', delay } },
    );
    makeWorker(
      queueName,
      async () => {
        throw new Error('retry');
      },
      { redisUrl },
    );
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'delayed');
    const member = await client.hget(`${queueBase}:job:${job.id}`, 'delayedMember');
    assert.isNotNull(member);
    const due = Number(await client.zscore(`${queueBase}:delayed`, member));
    assert.isAtLeast(due, before + delay);
    assert.isAtMost(due, (await redisTimestamp(client)) + delay);
  });

  it('does not retry unrecoverable processor errors', async () => {
    await queue.add('permanent', {}, { attempts: 10 });
    const processor = vi.fn(async () => {
      throw new UnrecoverableError('permanent');
    });
    const worker = makeWorker(queueName, processor, { redisUrl });
    const [job, error] = (await once(worker, 'failed')) as [Job, Error];
    assert.equal(processor.mock.calls.length, 1);
    assert.equal(job.failedAttempts, 1);
    assert.instanceOf(error, UnrecoverableError);
    assert.equal((await queue.getJobStatus(job.id)).state, 'failed');
  });

  it('bounds exponential retry delays when the exponential overflows', async () => {
    const job = await queue.add(
      'retry',
      {},
      {
        attempts: 1026,
        backoff: { type: 'exponential', delay: 1 },
      },
    );
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    await client.hset(`${queueBase}:job:${job.id}`, 'failedAttempts', 1024);
    const worker = makeWorker(
      queueName,
      async () => {
        throw new Error('retry');
      },
      {
        redisUrl,
        autorun: false,
      },
    );
    worker.run();
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'delayed');
    const member = await client.hget(`${queueBase}:job:${job.id}`, 'delayedMember');
    assert.isNotNull(member);
    assert.equal(
      Number(await client.zscore(`${queueBase}:delayed`, member)),
      Number.MAX_SAFE_INTEGER,
    );
    assert.equal((await queue.getJobStatus(job.id)).job?.failedAttempts, 1025);
  });

  it('succeeds after a retry', async () => {
    const job = await queue.add('flaky', {}, { attempts: 2 });

    let processorRuns = 0;
    makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        if (processorRuns < 2) throw new Error('first attempt fails');
        return 'recovered';
      },
      { redisUrl },
    );

    await waitForCompletedJobs(queue, 1);
    const status = await queue.getJobStatus(job.id);
    assert.equal(status.job?.returnvalue, 'recovered');
    assert.equal(status.job?.failedAttempts, 1);
  });

  it('limits concurrent jobs per group with groupConcurrency', async () => {
    for (const groupId of ['a', 'a', 'a', 'b', 'b', 'b']) {
      await queue.add('job', {}, { group: { id: groupId } });
    }

    const activePerGroup = new Map<string, number>();
    let maxPerGroup = 0;
    let maxTotal = 0;
    makeWorker(
      queueName,
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
      { redisUrl, concurrency: 4, groupConcurrency: 1 },
    );

    await waitForCompletedJobs(queue, 6);
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
    const firstWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 2,
    });
    const secondWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 2,
    });

    await Promise.all([firstWorker.waitUntilReady(), secondWorker.waitUntilReady()]);
    await waitUntil(async () => (await queue.getJobCounts()).completed === 8);
    assert.equal(maxActive, 2);
  });

  it('bounds a reservation-sized burst by group without starving another group', async () => {
    const hotGroup = 'stampeded-location-date';
    const unrelatedGroup = 'unrelated-location-date';
    const hotJobCount = 142;
    const unrelatedJobCount = 10;
    const totalJobCount = hotJobCount + unrelatedJobCount;
    await queue.addBulk([
      ...Array.from({ length: hotJobCount }, (_, index) => ({
        name: 'reservation',
        data: { index },
        options: { group: { id: hotGroup } },
      })),
      ...Array.from({ length: unrelatedJobCount }, (_, index) => ({
        name: 'reservation',
        data: { index },
        options: { group: { id: unrelatedGroup } },
      })),
    ]);

    let releaseInitialWave!: () => void;
    const initialWaveGate = new Promise<void>((resolve) => {
      releaseInitialWave = resolve;
    });
    const activePerGroup = new Map<string, number>();
    const maxActivePerGroup = new Map<string, number>();
    let maxTotalActive = 0;
    let completedHotJobs = 0;
    let hotJobsBeforeFirstUnrelatedCompletion: number | null = null;
    const processJob = async (job: Job) => {
      const groupId = job.groupId ?? '';
      const active = (activePerGroup.get(groupId) ?? 0) + 1;
      activePerGroup.set(groupId, active);
      maxActivePerGroup.set(groupId, Math.max(maxActivePerGroup.get(groupId) ?? 0, active));
      maxTotalActive = Math.max(
        maxTotalActive,
        [...activePerGroup.values()].reduce((sum, count) => sum + count, 0),
      );

      await initialWaveGate;

      activePerGroup.set(groupId, (activePerGroup.get(groupId) ?? 1) - 1);
      if (groupId === hotGroup) {
        completedHotJobs += 1;
      } else if (hotJobsBeforeFirstUnrelatedCompletion == null) {
        hotJobsBeforeFirstUnrelatedCompletion = completedHotJobs;
      }
    };
    const firstWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 3,
    });
    const secondWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 4,
      groupConcurrency: 3,
    });

    await Promise.all([firstWorker.waitUntilReady(), secondWorker.waitUntilReady()]);
    try {
      await waitUntil(
        async () => activePerGroup.get(hotGroup) === 3 && activePerGroup.get(unrelatedGroup) === 3,
      );
      const groups = new Map((await queue.getGroups()).map((group) => [group.id, group]));
      assert.deepInclude(groups.get(hotGroup), { waiting: 139, active: 3 });
      assert.deepInclude(groups.get(unrelatedGroup), { waiting: 7, active: 3 });
    } finally {
      releaseInitialWave();
    }

    await waitUntil(async () => (await queue.getJobCounts()).completed === totalJobCount);
    assert.equal(maxActivePerGroup.get(hotGroup), 3);
    assert.equal(maxActivePerGroup.get(unrelatedGroup), 3);
    assert.equal(maxTotalActive, 6);
    assert.isNotNull(hotJobsBeforeFirstUnrelatedCompletion);
    assert.isBelow(hotJobsBeforeFirstUnrelatedCompletion, hotJobCount);
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: totalJobCount,
      failed: 0,
    });
  });

  it('rejects workers with a different groupConcurrency', async () => {
    const firstWorker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      groupConcurrency: 2,
    });
    await firstWorker.waitUntilReady();

    const secondWorker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      groupConcurrency: 1,
      autorun: false,
    });
    const errors: Error[] = [];
    secondWorker.on('error', (error) => errors.push(error));
    secondWorker.run();

    await expect(secondWorker.waitUntilReady()).rejects.toThrow(
      `groupConcurrency is 2 for queue "${queueName}", not 1`,
    );
    assert.lengthOf(errors, 1);
  });

  it('retries an ambiguous fetch without claiming additional jobs', async () => {
    const jobs = await queue.addBulk([
      { name: 'first', data: {} },
      { name: 'second', data: {} },
    ]);
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const processed: string[] = [];
    const worker = makeWorker(
      queueName,
      async (job) => {
        processed.push(job.id);
        if (job.id === jobs[0].id) {
          markFirstStarted();
          await firstReleased;
        }
      },
      {
        redisUrl,
        autorun: false,
        maxStalledCount: 0,
        stalledInterval: 50,
      },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    const calls: Parameters<PrairieMQRedis['pmqMoveToActive']>[] = [];
    vi.spyOn(client, 'pmqMoveToActive').mockImplementation(async (...args) => {
      calls.push(args);
      const reply = await moveToActive(...args);
      if (calls.length <= 2) throw new Error('Command timed out');
      return reply;
    });
    const errors: Error[] = [];
    const stalled: string[] = [];
    worker.on('error', (error) => errors.push(error));
    worker.on('stalled', (jobId) => stalled.push(jobId));

    worker.run();
    await firstStarted;
    try {
      assert.isAtLeast(calls.length, 3);
      for (const call of calls.slice(1, 3)) {
        assert.deepEqual(call.slice(1, 5), calls[0].slice(1, 5));
      }
      assert.deepEqual(await queue.getJobCounts(), {
        waiting: 1,
        active: 1,
        delayed: 0,
        completed: 0,
        failed: 0,
      });
      assert.deepEqual(
        errors.map((error) => error.message),
        ['Command timed out', 'Command timed out'],
      );
      assert.deepEqual(stalled, []);
    } finally {
      releaseFirst();
    }

    await waitForCompletedJobs(queue, 2);
    assert.deepEqual(
      processed,
      jobs.map((job) => job.id),
    );
    assert.deepEqual(stalled, []);
  });

  it('renews a claim before processing when its reply consumed most of the lock', async () => {
    const job = await queue.add('job', {});
    let releaseProcessor!: () => void;
    const processorReleased = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });
    let markProcessorStarted!: () => void;
    const processorStarted = new Promise<void>((resolve) => {
      markProcessorStarted = resolve;
    });
    const worker = makeWorker(
      queueName,
      async () => {
        markProcessorStarted();
        await processorReleased;
      },
      {
        redisUrl,
        autorun: false,
        testLockDuration: 100,
      },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    const fetch = vi.spyOn(client, 'pmqMoveToActive').mockImplementationOnce(async (...args) => {
      const reply = await moveToActive(...args);
      await sleep(75);
      return reply;
    });

    worker.run();
    await processorStarted;
    try {
      assert.isAtLeast(fetch.mock.calls.length, 2);
      assert.deepEqual(fetch.mock.calls[1].slice(1, 5), fetch.mock.calls[0].slice(1, 5));
      assert.isAbove(await client.pttl(`${queueBase}:lock:${job.id}`), 0);
    } finally {
      releaseProcessor();
    }
    await waitForCompletedJobs(queue, 1);

    assert.equal((await queue.getJobStatus(job.id)).state, 'completed');
  });

  it('caches every fetch result and rejects replays of older sequences', async () => {
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const workerId = randomUUID();
    const sessionStartedAt = await redisTimestamp(client);
    const firstToken = randomUUID();
    const fetch = (sequence: number, token: string) =>
      client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        sequence,
        token,
        30_000,
        0,
        1,
        'claim',
      );

    assert.isNull(await fetch(1, firstToken));
    const jobs = await queue.addBulk([
      { name: 'first', data: {} },
      { name: 'second', data: {} },
    ]);
    assert.isNull(await fetch(1, firstToken));
    assert.equal((await queue.getJobCounts()).waiting, 2);

    const secondToken = randomUUID();
    const claimed = await fetch(2, secondToken);
    assert.equal(claimed?.[claimed.indexOf('id') + 1], jobs[0].id);
    assert.deepEqual(await fetch(2, secondToken), claimed);
    assert.deepEqual(await queue.getGroups(), [{ id: null, waiting: 1, active: 1 }]);

    assert.equal(await client.pmqMoveToCompleted(queueBase, jobs[0].id, secondToken, 'null', 0), 0);
    assert.deepEqual(await fetch(2, secondToken), ['claim-lost']);
    assert.equal((await queue.getJobCounts()).waiting, 1);

    const thirdToken = randomUUID();
    const nextClaimed = await fetch(3, thirdToken);
    assert.equal(nextClaimed?.[nextClaimed.indexOf('id') + 1], jobs[1].id);
    assert.deepEqual(await fetch(2, secondToken), ['stale-fetch']);
    assert.deepEqual(await queue.getJobCounts(), {
      waiting: 0,
      active: 1,
      delayed: 0,
      completed: 1,
      failed: 0,
    });
  });

  it('rejects expired fetch sessions and sequence gaps without mutating the queue', async () => {
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const expiredWorkerId = randomUUID();
    assert.deepEqual(
      await client.pmqMoveToActive(
        queueBase,
        expiredWorkerId,
        0,
        1,
        randomUUID(),
        30_000,
        0,
        1,
        'claim',
      ),
      ['session-expired'],
    );

    const workerId = randomUUID();
    const sessionStartedAt = await redisTimestamp(client);
    const firstToken = randomUUID();
    assert.isNull(
      await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        1,
        firstToken,
        30_000,
        0,
        1,
        'claim',
      ),
    );
    assert.deepEqual(
      await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        3,
        randomUUID(),
        30_000,
        0,
        1,
        'claim',
      ),
      ['fetch-sequence-gap'],
    );
    const secondToken = randomUUID();
    assert.isNull(
      await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        2,
        secondToken,
        30_000,
        0,
        1,
        'claim',
      ),
    );
    await client.del(`${queueBase}:fetch:${workerId}`);

    const job = await queue.add('job', {});
    assert.deepEqual(
      await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        2,
        secondToken,
        30_000,
        0,
        1,
        'claim',
      ),
      ['session-expired'],
    );
    assert.equal((await queue.getJobCounts()).waiting, 1);

    const newWorkerId = randomUUID();
    const newSessionStartedAt = await redisTimestamp(client);
    const claimed = await client.pmqMoveToActive(
      queueBase,
      newWorkerId,
      newSessionStartedAt,
      1,
      randomUUID(),
      30_000,
      0,
      1,
      'claim',
    );
    assert.equal(claimed?.[claimed.indexOf('id') + 1], job.id);
  });

  it('does not reacquire a cached claim after its stalled generation changes', async () => {
    const job = await queue.add('job', {});
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const workerId = randomUUID();
    const sessionStartedAt = await redisTimestamp(client);
    const token = randomUUID();
    const fetch = () =>
      client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        1,
        token,
        30_000,
        0,
        1,
        'claim',
      );

    const claimed = await fetch();
    assert.equal(claimed?.[claimed.indexOf('id') + 1], job.id);
    await client
      .multi()
      .del(`${queueBase}:lock:${job.id}`)
      .hincrby(`${queueBase}:job:${job.id}`, 'stalledCount', 1)
      .exec();

    assert.deepEqual(await fetch(), ['claim-lost']);
    assert.equal(await client.exists(`${queueBase}:lock:${job.id}`), 0);
  });

  it('reconciles an ambiguous fetch before closing gracefully', async () => {
    const job = await queue.add('job', {});
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
      },
      { redisUrl, autorun: false, maxStalledCount: 0 },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    vi.spyOn(client, 'pmqMoveToActive').mockImplementationOnce(async (...args) => {
      await moveToActive(...args);
      throw new Error('Command timed out');
    });
    const error = once(worker, 'error');

    worker.run();
    await error;
    await worker.close();

    assert.equal(processorRuns, 1);
    assert.equal((await queue.getJobStatus(job.id)).state, 'completed');
  });

  it('does not claim new work while reconciling a graceful close', async () => {
    const job = await queue.add('job', {});
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
      },
      { redisUrl, autorun: false },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    vi.spyOn(client, 'pmqMoveToActive').mockRejectedValueOnce(
      new Error('Command timed out before execution'),
    );
    const error = once(worker, 'error');

    worker.run();
    await error;
    await worker.close();

    assert.equal(processorRuns, 0);
    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
  });

  it('force-closes if pending-fetch reconciliation gets a permanent Redis error', async () => {
    const job = await queue.add('job', {});
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const timeoutError = new Error('Command timed out before execution');
    const permissionError = new ReplyError(
      "NOPERM User worker has no permissions to run the 'evalsha' command",
    );
    const moveToActive = vi
      .spyOn(client, 'pmqMoveToActive')
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(permissionError);
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    worker.run();
    await waitUntil(async () => errors.includes(timeoutError));
    await worker.close();

    expect(moveToActive).toHaveBeenCalledTimes(2);
    assert.deepEqual(errors, [timeoutError, permissionError]);
    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
  });

  it('does not start a fetched job after being force-closed', async () => {
    const job = await queue.add('job', {});
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
      },
      { redisUrl, autorun: false },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    let releaseReply!: () => void;
    const replyReleased = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    let markJobClaimed!: () => void;
    const jobClaimed = new Promise<void>((resolve) => {
      markJobClaimed = resolve;
    });
    vi.spyOn(client, 'pmqMoveToActive').mockImplementationOnce(async (...args) => {
      const reply = await moveToActive(...args);
      markJobClaimed();
      await replyReleased;
      return reply;
    });

    worker.run();
    await jobClaimed;
    const close = worker.close(true);
    releaseReply();
    await close;

    assert.equal(processorRuns, 0);
    assert.equal((await queue.getJobStatus(job.id)).state, 'active');
  });

  it('does not start a reconciled job after a graceful close is forced', async () => {
    const job = await queue.add('job', {});
    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
      },
      { redisUrl, autorun: false },
    );
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    let releaseReconciliation!: () => void;
    const reconciliationReleased = new Promise<void>((resolve) => {
      releaseReconciliation = resolve;
    });
    let markReconciliationStarted!: () => void;
    const reconciliationStarted = new Promise<void>((resolve) => {
      markReconciliationStarted = resolve;
    });
    let fetchCalls = 0;
    vi.spyOn(client, 'pmqMoveToActive').mockImplementation(async (...args) => {
      fetchCalls += 1;
      const reply = await moveToActive(...args);
      if (fetchCalls === 1) throw new Error('Command timed out');
      if (fetchCalls === 2) {
        markReconciliationStarted();
        await reconciliationReleased;
      }
      return reply;
    });
    const error = once(worker, 'error');

    worker.run();
    await error;
    const gracefulClose = worker.close();
    await reconciliationStarted;
    const forcedClose = worker.close(true);
    releaseReconciliation();
    await Promise.all([gracefulClose, forcedClose]);

    assert.equal(processorRuns, 0);
    assert.equal((await queue.getJobStatus(job.id)).state, 'active');
  });

  it('fails startup after repeated groupConcurrency mismatches while fetching', async () => {
    const worker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      groupConcurrency: 1,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as {
      pmqMoveToActive: () => Promise<string[]>;
    };
    const moveToActive = vi
      .spyOn(client, 'pmqMoveToActive')
      .mockResolvedValue(['group-concurrency-mismatch', '2']);
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    worker.run();

    await expect(worker.waitUntilReady()).rejects.toThrow(
      `groupConcurrency is 2 for queue "${queueName}", not 1`,
    );
    expect(moveToActive).toHaveBeenCalledTimes(3);
    assert.lengthOf(errors, 3);
  });

  it('recovers from a transient groupConcurrency mismatch while fetching', async () => {
    const worker = makeWorker(queueName, async () => 'done', {
      redisUrl,
      groupConcurrency: 1,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const moveToActive = client.pmqMoveToActive.bind(client);
    let moveToActiveCalls = 0;
    vi.spyOn(client, 'pmqMoveToActive').mockImplementation(async (...args) => {
      moveToActiveCalls += 1;
      if (moveToActiveCalls === 1 || moveToActiveCalls === 3 || moveToActiveCalls === 5) {
        await client.set(`${queueBase}:group-concurrency`, '2');
        try {
          return await moveToActive(...args);
        } finally {
          await client.set(`${queueBase}:group-concurrency`, '1');
        }
      }
      return moveToActive(...args);
    });
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));

    worker.run();
    await worker.waitUntilReady();
    await queue.add('first', {});
    await waitUntil(async () => errors.length === 3);
    await queue.add('second', {});
    await waitForCompletedJobs(queue, 2);

    assert.deepEqual(
      errors.map((error) => error.message),
      Array.from({ length: 3 }, () => `groupConcurrency is 2 for queue "${queueName}", not 1`),
    );
  });

  it('does not recover stalled jobs after failing startup', async () => {
    const job = await queue.add('stall', {});
    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      groupConcurrency: 2,
      testLockDuration: 100,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    const rejectedWorker = makeWorker(queueName, async () => 'unexpected', {
      redisUrl,
      groupConcurrency: 1,
      maxStalledCount: 0,
      stalledInterval: 250,
      autorun: false,
    });
    rejectedWorker.on('error', () => {});
    rejectedWorker.run();

    await expect(rejectedWorker.waitUntilReady()).rejects.toThrow(
      `groupConcurrency is 2 for queue "${queueName}", not 1`,
    );
    await sleep(350);

    assert.equal((await queue.getJobStatus(job.id)).state, 'active');
  });

  it('restores groupConcurrency if its Redis setting is lost', async () => {
    let active = 0;
    let maxActive = 0;
    const processJob = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(100);
      active -= 1;
    };
    const firstWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 3,
      groupConcurrency: 1,
    });
    const secondWorker = makeWorker(queueName, processJob, {
      redisUrl,
      concurrency: 3,
      groupConcurrency: 1,
    });
    await Promise.all([firstWorker.waitUntilReady(), secondWorker.waitUntilReady()]);

    const redis = new Redis<'legacy'>(redisUrl);
    try {
      await redis.del(`${queueBase}:group-concurrency`);
      await queue.addBulk(
        Array.from({ length: 6 }, (_, data) => ({
          name: 'job',
          data,
          options: { group: { id: 'shared' } },
        })),
      );

      await waitUntil(async () => (await queue.getJobCounts()).completed === 6);
      assert.equal(maxActive, 1);
      assert.equal(await redis.get(`${queueBase}:group-concurrency`), '1');
    } finally {
      await redis.quit();
    }
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
      queueName,
      async () => {
        markStarted();
        await processorReleased;
        return 'done';
      },
      { redisUrl, testLockDuration: 150 },
    );
    await processorStarted;

    const closePromise = worker.close();
    let processedBySecondWorker = false;
    const secondWorker = makeWorker(
      queueName,
      async () => {
        processedBySecondWorker = true;
        return 'duplicate';
      },
      { redisUrl, stalledInterval: 50 },
    );
    await secondWorker.waitUntilReady();

    await sleep(500);
    assert.isFalse(processedBySecondWorker);
    assert.equal((await queue.getJobStatus(job.id)).state, 'active');

    releaseProcessor();
    await closePromise;
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'completed');
    assert.isFalse(processedBySecondWorker);
  });

  it('can force a graceful close that is waiting on a processor', async () => {
    await queue.add('slow', {});
    let releaseProcessor!: () => void;
    const processorReleased = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });
    let markStarted!: () => void;
    const processorStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const worker = makeWorker(
      queueName,
      async () => {
        markStarted();
        await processorReleased;
      },
      { redisUrl },
    );
    await processorStarted;

    const gracefulClose = worker.close();
    const forcedClose = worker.close(true);
    const closedBeforeProcessor = await Promise.race([
      forcedClose.then(() => true),
      sleep(500).then(() => false),
    ]);

    releaseProcessor();
    await gracefulClose;
    assert.isTrue(closedBeforeProcessor);
  });

  it.each([
    { close: 'gracefully closes', force: false, startup: 'run' },
    { close: 'gracefully closes', force: false, startup: 'preflight' },
    { close: 'force-closes', force: true, startup: 'run' },
    { close: 'force-closes', force: true, startup: 'preflight' },
  ] as const)('$close while Redis is reconnecting during $startup', async ({ force, startup }) => {
    const port = await getUnusedPort();
    const worker = makeWorker(queueName, async () => undefined, {
      redisUrl: `redis://127.0.0.1:${port}/`,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as PrairieMQRedis;
    const blockingClient = Reflect.get(worker, 'blockingClient') as Redis;
    worker.on('error', () => {});
    if (startup === 'run') {
      worker.run();
    } else {
      void worker.preflight().catch(() => {});
    }
    await waitUntil(async () => {
      return client.status === 'reconnecting' && blockingClient.status === 'reconnecting';
    });

    const closed = await Promise.race([
      worker.close(force).then(() => true),
      sleep(500).then(() => false),
    ]);
    assert.isTrue(closed);
  });

  it('disconnects if graceful close fails', async () => {
    const worker = makeWorker(queueName, async () => {}, {
      redisUrl,
      autorun: false,
    });
    const client = Reflect.get(worker, 'client') as {
      quit: () => Promise<string>;
      disconnect: () => void;
    };
    vi.spyOn(client, 'quit').mockRejectedValueOnce(new Error('Redis connection closed'));
    const disconnect = vi.spyOn(client, 'disconnect');

    await expect(worker.close()).resolves.toBeUndefined();

    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('forwards errors from both Redis connections', () => {
    const worker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      autorun: false,
    });
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));
    const client = Reflect.get(worker, 'client') as { emit: (event: string, error: Error) => void };
    const blockingClient = Reflect.get(worker, 'blockingClient') as {
      emit: (event: string, error: Error) => void;
    };

    client.emit('error', new Error('command connection failed'));
    blockingClient.emit('error', new Error('blocking connection failed'));

    assert.deepEqual(
      errors.map((error) => error.message),
      ['command connection failed', 'blocking connection failed'],
    );
  });

  it.each([
    { transition: 'pmqMoveToCompleted', expectedState: 'completed' },
    { transition: 'pmqMoveToFailed', expectedState: 'failed' },
  ] as const)(
    'does not report a lost lock while a job is being moved to $expectedState',
    async ({ transition, expectedState }) => {
      const job = await queue.add('terminal-transition', {});
      let releaseProcessor!: () => void;
      const processorReleased = new Promise<void>((resolve) => {
        releaseProcessor = resolve;
      });
      let markProcessorStarted!: () => void;
      const processorStarted = new Promise<void>((resolve) => {
        markProcessorStarted = resolve;
      });
      const worker = makeWorker(
        queueName,
        async () => {
          markProcessorStarted();
          await processorReleased;
          if (expectedState === 'failed') throw new Error('Processor failed');
          return 'done';
        },
        { redisUrl, lockDuration: 60_000 },
      );
      const errors: Error[] = [];
      worker.on('error', (error) => errors.push(error));
      await processorStarted;

      const client = Reflect.get(worker, 'client') as {
        pmqMoveToCompleted: (...args: (string | number)[]) => Promise<number>;
        pmqMoveToFailed: (...args: (string | number)[]) => Promise<number>;
      };
      const moveToTerminalState = client[transition].bind(client);
      let markTransitionApplied!: () => void;
      const transitionApplied = new Promise<void>((resolve) => {
        markTransitionApplied = resolve;
      });
      let releaseTransition!: () => void;
      const transitionReleased = new Promise<void>((resolve) => {
        releaseTransition = resolve;
      });
      vi.spyOn(client, transition).mockImplementation(async (...args) => {
        const code = await moveToTerminalState(...args);
        markTransitionApplied();
        await transitionReleased;
        return code;
      });

      releaseProcessor();
      await transitionApplied;
      try {
        const extendLocks = Reflect.get(worker, 'extendLocks') as () => Promise<void>;
        await extendLocks.call(worker);
      } finally {
        releaseTransition();
      }

      await waitUntil(async () => (await queue.getJobStatus(job.id)).state === expectedState);
      assert.deepEqual(errors, []);
    },
  );

  it('reports a lost lock only once', async () => {
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
      queueName,
      async () => {
        markStarted();
        await processorReleased;
      },
      { redisUrl, testLockDuration: 100, stalledInterval: 10_000 },
    );
    const errors: Error[] = [];
    worker.on('error', (error) => errors.push(error));
    await processorStarted;

    const redis = new Redis<'legacy'>(redisUrl);
    try {
      await redis.del(`${queueBase}:lock:${job.id}`);
      await waitUntil(async () => errors.length > 0);
      releaseProcessor();
      await sleep(100);
    } finally {
      releaseProcessor();
      await redis.quit();
    }

    assert.lengthOf(errors, 1);
    assert.equal(errors[0].message, `Lost lock while processing job ${job.id}`);
  });

  it('recovers stalled jobs', async () => {
    const job = await queue.add('stall', {});

    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      testLockDuration: 300,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    const worker = makeWorker(queueName, async () => 'recovered', {
      redisUrl,
      stalledInterval: 100,
    });
    const stalled = once(worker, 'stalled');
    const [stalledJobId, stalledPermanently] = await stalled;
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'completed');
    const status = await queue.getJobStatus(job.id);
    assert.equal(stalledJobId, job.id);
    assert.isFalse(stalledPermanently);
    assert.equal(status.job?.returnvalue, 'recovered');
  });

  it('uses the default stalled limit when a claim has no recorded limit', async () => {
    const job = await queue.add('stall', {});
    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      lockDuration: 60_000,
      maxStalledCount: 5,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    await client.hdel(`${queueBase}:job:${job.id}`, 'claimMaxStalledCount');
    await client.del(`${queueBase}:lock:${job.id}`, `${queueBase}:stalled-check`);

    assert.deepEqual(await client.pmqCheckStalled(queueBase, realNowTimestamp(), 100), [
      [job.id],
      [],
    ]);
    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
  });

  it('scans for stalled jobs only while holding the queue-wide lease', async () => {
    const job = await queue.add('stall', {});
    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      lockDuration: 60_000,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    const checker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      autorun: false,
    });
    interface StalledCheckClient {
      del: (...keys: string[]) => Promise<number>;
      pmqCheckStalled: (
        prefix: string,
        now: number,
        stalledInterval: number,
      ) => Promise<[string[], string[]]>;
      pttl: (key: string) => Promise<number>;
    }
    const firstClient = Reflect.get(queue, 'client') as StalledCheckClient;
    const secondClient = Reflect.get(checker, 'client') as PrairieMQRedis;
    await waitForRedisConnection(secondClient);
    const stalledInterval = 100;
    assert.deepEqual(
      await firstClient.pmqCheckStalled(queueBase, realNowTimestamp(), stalledInterval),
      [[], []],
    );
    assert.isAbove(await firstClient.pttl(`${queueBase}:stalled-check`), 0);

    await firstClient.del(`${queueBase}:lock:${job.id}`);
    assert.deepEqual(
      await secondClient.pmqCheckStalled(queueBase, realNowTimestamp(), stalledInterval),
      [[], []],
    );
    assert.equal((await queue.getJobStatus(job.id)).state, 'active');

    await waitUntil(async () => (await secondClient.pttl(`${queueBase}:stalled-check`)) === -2);
    assert.deepEqual(
      await secondClient.pmqCheckStalled(queueBase, realNowTimestamp(), stalledInterval),
      [[job.id], []],
    );
    assert.equal((await queue.getJobStatus(job.id)).state, 'waiting');
  });

  it('schedules the next stalled check after the previous check finishes', async () => {
    const worker = makeWorker(queueName, async () => undefined, {
      redisUrl,
      autorun: false,
      stalledInterval: 50,
    });
    const client = Reflect.get(worker, 'client') as {
      pmqCheckStalled: (
        prefix: string,
        now: number,
        stalledInterval: number,
      ) => Promise<[string[], string[]]>;
    };
    let markCheckStarted!: () => void;
    const checkStarted = new Promise<void>((resolve) => {
      markCheckStarted = resolve;
    });
    let finishCheck!: (result: [string[], string[]]) => void;
    const checkFinished = new Promise<[string[], string[]]>((resolve) => {
      finishCheck = resolve;
    });
    const checkStalled = vi
      .spyOn(client, 'pmqCheckStalled')
      .mockImplementationOnce(() => {
        markCheckStarted();
        return checkFinished;
      })
      .mockResolvedValue([[], []]);

    worker.run();
    await worker.waitUntilReady();
    await checkStarted;
    try {
      await sleep(100);
      expect(checkStalled).toHaveBeenCalledOnce();
    } finally {
      finishCheck([[], []]);
    }
    await waitUntil(async () => checkStalled.mock.calls.length >= 2);
  });

  it('does not count stalled recovery against processor failure retries', async () => {
    const job = await queue.add('stall-then-fail', {}, { attempts: 2 });

    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      testLockDuration: 300,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    let processorRuns = 0;
    const worker = makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        if (processorRuns === 1) throw new Error('first reported failure');
        return 'recovered';
      },
      { redisUrl, stalledInterval: 100 },
    );
    const stalled = once(worker, 'stalled');

    await stalled;
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'completed');
    const status = await queue.getJobStatus(job.id);
    assert.equal(status.job?.returnvalue, 'recovered');
    assert.equal(processorRuns, 2);
    assert.equal(status.job?.failedAttempts, 1);
  });

  it('uses the stalled limit recorded by each claiming worker', async () => {
    const job = await queue.add('stall', {});
    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      maxStalledCount: 5,
      testLockDuration: 150,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    let markReclaimed!: () => void;
    const reclaimed = new Promise<void>((resolve) => {
      markReclaimed = resolve;
    });
    const reclaimer = makeWorker(
      queueName,
      async () => {
        markReclaimed();
        await new Promise(() => {});
      },
      {
        redisUrl,
        autorun: false,
        maxStalledCount: 0,
        stalledInterval: 50,
        testLockDuration: 150,
      },
    );
    const firstStall = once(reclaimer, 'stalled');
    reclaimer.run();

    const [firstStalledJobId, firstStalledPermanently] = await firstStall;
    assert.equal(firstStalledJobId, job.id);
    assert.isFalse(firstStalledPermanently);
    await reclaimed;
    await reclaimer.close(true);

    let finalProcessorRuns = 0;
    const finalChecker = makeWorker(
      queueName,
      async () => {
        finalProcessorRuns += 1;
      },
      {
        redisUrl,
        autorun: false,
        maxStalledCount: 5,
        stalledInterval: 50,
      },
    );
    const secondStall = once(finalChecker, 'stalled');
    finalChecker.run();

    const [secondStalledJobId, secondStalledPermanently] = await secondStall;
    assert.equal(secondStalledJobId, job.id);
    assert.isTrue(secondStalledPermanently);
    assert.equal(finalProcessorRuns, 0);
    assert.equal((await queue.getJobStatus(job.id)).state, 'failed');
  });

  it('applies failed-job retention when a stalled job exceeds its limit', async () => {
    const job = await queue.add('stall', {}, { removeOnFail: true });
    const stuckWorker = makeWorker(queueName, () => new Promise(() => {}), {
      redisUrl,
      maxStalledCount: 0,
      testLockDuration: 150,
    });
    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'active');
    await stuckWorker.close(true);

    const worker = makeWorker(queueName, async () => 'unexpected', {
      redisUrl,
      autorun: false,
      maxStalledCount: 5,
      stalledInterval: 50,
    });
    const stalled = once(worker, 'stalled');
    worker.run();
    const [stalledJobId, stalledPermanently] = await stalled;

    assert.equal(stalledJobId, job.id);
    assert.isTrue(stalledPermanently);
    assert.equal((await queue.getJobStatus(job.id)).state, 'unknown');
    assert.equal((await queue.getJobCounts()).failed, 0);
  });

  it('removes job data when removeOnComplete is set', async () => {
    const job = await queue.add('ephemeral', {}, { removeOnComplete: true });
    makeWorker(queueName, async () => 'done', { redisUrl });

    await waitUntil(async () => (await queue.getJobStatus(job.id)).state === 'unknown');
    const counts = await queue.getJobCounts();
    assert.equal(counts.completed, 0);
  });

  it('retains only the configured number of completed jobs', async () => {
    const jobs = await queue.addBulk(
      [1, 2, 3].map((data) => ({ name: 'retained', data, options: { removeOnComplete: 2 } })),
    );
    let processorRuns = 0;
    makeWorker(
      queueName,
      async () => {
        processorRuns += 1;
        return 'done';
      },
      { redisUrl },
    );

    await waitUntil(async () => processorRuns === 3 && (await queue.getJobCounts()).active === 0);
    const retained = await Promise.all(
      jobs.map(async (job) => (await queue.getJobStatus(job.id)).job),
    );
    assert.isNull(retained[0]);
    assert.isNotNull(retained[1]);
    assert.isNotNull(retained[2]);
    assert.equal((await queue.getJobCounts()).completed, 2);
  });

  it('includes terminal jobs created before bounded retention was enabled', async () => {
    const existingJobs = await queue.addBulk(
      [1, 2].map((data) => ({ name: 'existing', data, options: { removeOnComplete: false } })),
    );
    makeWorker(queueName, async () => 'done', { redisUrl });
    await waitForCompletedJobs(queue, 2);

    const newestJob = await queue.add('bounded', 3, { removeOnComplete: 2 });
    await waitUntil(async () => (await queue.getJobStatus(newestJob.id)).state === 'completed');

    assert.equal((await queue.getJobStatus(existingJobs[0].id)).state, 'unknown');
    assert.equal((await queue.getJobStatus(existingJobs[1].id)).state, 'completed');
    assert.equal((await queue.getJobStatus(newestJob.id)).state, 'completed');
    assert.equal((await queue.getJobCounts()).completed, 2);
  });

  it.each([
    { targets: [1, 200] as const, retained: [true, true] as const },
    { targets: [200, 1] as const, retained: [false, true] as const },
  ])(
    'composes overlapping numeric retention requests in order ($targets)',
    async ({ targets, retained }) => {
      const existingJobs = await queue.addBulk(
        Array.from({ length: 301 }, (_, data) => ({ name: 'existing', data })),
      );
      const initialWorker = makeWorker(queueName, async () => 'done', { redisUrl });
      await waitForCompletedJobs(queue, existingJobs.length);
      await initialWorker.close();

      const jobs = await queue.addBulk(
        targets.map((removeOnComplete, index) => ({
          name: 'bounded',
          data: index,
          options: { removeOnComplete },
        })),
      );
      const client = Reflect.get(queue, 'client') as PrairieMQRedis;
      const workerId = randomUUID();
      const sessionStartedAt = await redisTimestamp(client);
      const tokens = [randomUUID(), randomUUID()];
      for (const [index, job] of jobs.entries()) {
        const reply = await client.pmqMoveToActive(
          queueBase,
          workerId,
          sessionStartedAt,
          index + 1,
          tokens[index],
          30_000,
          0,
          1,
          'claim',
        );
        assert.equal(reply?.[reply.indexOf('id') + 1], job.id);
      }
      for (const [index, job] of jobs.entries()) {
        assert.equal(
          await client.pmqMoveToCompleted(queueBase, job.id, tokens[index], 'null', targets[index]),
          0,
        );
      }
      assert.equal(await client.exists(`${queueBase}:completed:trim-cutoff`), 1);

      const restartedWorker = makeWorker(queueName, async () => 'unexpected', { redisUrl });
      await restartedWorker.waitUntilReady();
      await waitUntil(
        async () => (await queue.getJobCounts()).completed === retained.filter(Boolean).length,
      );

      assert.equal(await client.exists(`${queueBase}:completed:trim-cutoff`), 0);
      assert.equal((await queue.getJobStatus(existingJobs.at(-1)!.id)).state, 'unknown');
      for (const [index, job] of jobs.entries()) {
        assert.equal(
          (await queue.getJobStatus(job.id)).state,
          retained[index] ? 'completed' : 'unknown',
        );
      }
    },
  );

  it('continues bounded retention while every worker slot is occupied', async () => {
    const existingJobs = await queue.addBulk(
      Array.from({ length: 301 }, (_, data) => ({ name: 'existing', data })),
    );
    const initialWorker = makeWorker(queueName, async () => 'done', { redisUrl });
    await waitForCompletedJobs(queue, existingJobs.length);
    await initialWorker.close();

    const newestJob = await queue.add('bounded', {}, { removeOnComplete: 1 });
    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const token = randomUUID();
    const reply = await client.pmqMoveToActive(
      queueBase,
      randomUUID(),
      await redisTimestamp(client),
      1,
      token,
      30_000,
      0,
      1,
      'claim',
    );
    assert.equal(reply?.[reply.indexOf('id') + 1], newestJob.id);
    assert.equal(await client.pmqMoveToCompleted(queueBase, newestJob.id, token, 'null', 1), 0);

    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let releaseProcessor!: () => void;
    const processorReleased = new Promise<void>((resolve) => {
      releaseProcessor = resolve;
    });
    await queue.add('occupied', {});
    makeWorker(
      queueName,
      async () => {
        markStarted();
        await processorReleased;
      },
      { redisUrl, stalledInterval: 50 },
    );
    await started;

    try {
      await waitUntil(
        async () =>
          (await queue.getJobCounts()).completed === 1 &&
          (await client.exists(`${queueBase}:completed:trim-cutoff`)) === 0,
      );
      assert.equal((await queue.getJobCounts()).active, 1);
      assert.equal((await queue.getJobStatus(existingJobs.at(-1)!.id)).state, 'unknown');
      assert.equal((await queue.getJobStatus(newestJob.id)).state, 'completed');
    } finally {
      releaseProcessor();
    }
  });

  it.each(['completed', 'failed'] as const)(
    'retains the newest %s job regardless of job id ordering',
    async (state) => {
      const ids = [`z-${state}-older`, `a-${state}-newer`];
      const retentionOptions =
        state === 'completed' ? { removeOnComplete: 1 } : { removeOnFail: 1 };
      await queue.addBulk(
        ids.map((jobId) => ({
          name: state,
          data: {},
          options: { jobId, ...retentionOptions },
        })),
      );

      const client = Reflect.get(queue, 'client') as PrairieMQRedis;
      const workerId = randomUUID();
      const sessionStartedAt = await redisTimestamp(client);
      for (const [index, jobId] of ids.entries()) {
        const token = randomUUID();
        const reply = await client.pmqMoveToActive(
          queueBase,
          workerId,
          sessionStartedAt,
          index + 1,
          token,
          30_000,
          0,
          1,
          'claim',
        );
        assert.equal(reply?.[reply.indexOf('id') + 1], jobId);

        const code =
          state === 'completed'
            ? await client.pmqMoveToCompleted(queueBase, jobId, token, 'null', 1)
            : await client.pmqMoveToFailed(queueBase, jobId, token, 0, 0, 1);
        assert.equal(code, 0);
      }

      assert.equal((await queue.getJobStatus(ids[0])).state, 'unknown');
      assert.equal((await queue.getJobStatus(ids[1])).state, state);
      assert.equal((await queue.getJobCounts())[state], 1);
    },
  );

  it('retains the newest permanently stalled job from the same scan', async () => {
    const ids = ['z-stalled-older', 'a-stalled-newer'];
    await queue.addBulk(
      ids.map((jobId) => ({
        name: 'stalled',
        data: {},
        options: { jobId, removeOnFail: 1 },
      })),
    );

    const client = Reflect.get(queue, 'client') as PrairieMQRedis;
    const workerId = randomUUID();
    const sessionStartedAt = await redisTimestamp(client);
    for (const [index, jobId] of ids.entries()) {
      const reply = await client.pmqMoveToActive(
        queueBase,
        workerId,
        sessionStartedAt,
        index + 1,
        randomUUID(),
        30_000,
        0,
        0,
        'claim',
      );
      assert.equal(reply?.[reply.indexOf('id') + 1], jobId);
    }
    await client.del(
      ...ids.map((jobId) => `${queueBase}:lock:${jobId}`),
      `${queueBase}:stalled-check`,
    );

    assert.deepEqual(await client.pmqCheckStalled(queueBase, realNowTimestamp(), 100), [[], ids]);
    assert.equal((await queue.getJobStatus(ids[0])).state, 'unknown');
    assert.equal((await queue.getJobStatus(ids[1])).state, 'failed');
    assert.equal((await queue.getJobCounts()).failed, 1);
  });

  it('rejects invalid worker options', () => {
    const invalidOptions = [
      { concurrency: 1001 },
      { groupConcurrency: -1 },
      { maxStalledCount: -1 },
      { lockDuration: 0 },
      { stalledInterval: 0 },
      { stalledInterval: 1.5 },
      { stalledInterval: MAX_TIMER_DELAY_MILLISECONDS + 1 },
    ];

    for (const options of invalidOptions) {
      const [name] = Object.keys(options);
      expect(() => new Worker(queueName, async () => undefined, { redisUrl, ...options })).toThrow(
        name,
      );
    }
    expect(
      () =>
        new Worker(queueName, async () => undefined, {
          redisUrl,
          lockDuration: 29_999,
        }),
    ).toThrow('lockDuration must be at least 30000ms');
  });

  it('rejects malformed worker configuration before connecting to Redis', () => {
    const invalidOptions: [unknown, string][] = [
      [undefined, 'Worker options must be a plain object'],
      [null, 'Worker options must be a plain object'],
      [[], 'Worker options must be a plain object'],
      [false, 'Worker options must be a plain object'],
      [{ redisUrl, groupConcurreny: 2 }, 'Unknown worker option "groupConcurreny"'],
      [{ redisUrl, autoRun: false }, 'Unknown worker option "autoRun"'],
      [{}, 'redisUrl'],
      [{ redisUrl: null }, 'redisUrl'],
      [{ redisUrl: '' }, 'redisUrl'],
      [{ redisUrl: 'http://localhost:6379' }, 'redisUrl'],
      [{ redisUrl: 'redis://' }, 'redisUrl'],
      [{ redisUrl, prefix: null }, 'prefix'],
      [{ redisUrl, prefix: '' }, 'prefix'],
      [{ redisUrl, prefix: 42 }, 'prefix'],
      [{ redisUrl, concurrency: null }, 'concurrency'],
      [{ redisUrl, groupConcurrency: null }, 'groupConcurrency'],
      [{ redisUrl, lockDuration: null }, 'lockDuration'],
      [{ redisUrl, maxStalledCount: null }, 'maxStalledCount'],
      [{ redisUrl, stalledInterval: null }, 'stalledInterval'],
      [{ redisUrl, autorun: null }, 'autorun'],
      [{ redisUrl, autorun: 'false' }, 'autorun'],
    ];

    for (const [options, message] of invalidOptions) {
      expect(() => new Worker(queueName, async () => undefined, options as WorkerOptions)).toThrow(
        message,
      );
    }

    expect(() => new Worker(queueName, null as never, { redisUrl, autorun: false })).toThrow(
      'processor must be a function',
    );
  });

  it('does not process jobs while the queue is paused', async () => {
    await queue.pause();
    await queue.add('patient', {});

    makeWorker(queueName, async () => 'done', { redisUrl });
    await sleep(300);
    let counts = await queue.getJobCounts();
    assert.equal(counts.waiting, 1);
    assert.equal(counts.completed, 0);

    await queue.resume();
    await waitForCompletedJobs(queue, 1);
    counts = await queue.getJobCounts();
    assert.equal(counts.completed, 1);
  });
});
