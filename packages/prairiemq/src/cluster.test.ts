import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Cluster, Redis } from 'ioredis';
import { afterAll, afterEach, assert, beforeAll, describe, expect, it, vi } from 'vitest';

import { Queue } from './queue.js';
import { Worker } from './worker.js';

async function freePorts(count: number): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer());
  try {
    await Promise.all(
      servers.map(async (server) => {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
      }),
    );
    return servers.map((server) => (server.address() as AddressInfo).port);
  } finally {
    await Promise.all(
      servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
  }
}

describe('Redis Cluster', () => {
  let directory: string;
  let redisProcess: ChildProcessWithoutNullStreams;
  let client: Redis;
  let redisUrl: string;
  const queues: Queue<{ value: number }, number>[] = [];
  const workers: Worker<{ value: number }, number>[] = [];
  const errors: Error[] = [];

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'prairiemq-cluster-'));
    const [port, busPort] = await freePorts(2);
    redisUrl = `redis://127.0.0.1:${port}`;
    redisProcess = spawn('redis-server', [
      '--bind',
      '127.0.0.1',
      '--port',
      String(port),
      '--cluster-port',
      String(busPort),
      '--cluster-enabled',
      'yes',
      '--cluster-config-file',
      'nodes.conf',
      '--cluster-node-timeout',
      '1000',
      '--cluster-announce-ip',
      '127.0.0.1',
      '--dir',
      directory,
      '--save',
      '',
      '--appendonly',
      'no',
    ]);
    await new Promise<void>((resolve, reject) => {
      let output = '';
      redisProcess.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes('Ready to accept connections')) resolve();
      });
      redisProcess.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      redisProcess.once('error', reject);
      redisProcess.once('exit', (code) => {
        reject(new Error(`Redis Cluster node exited with code ${code}: ${output}`));
      });
    });
    client = new Redis<'legacy'>(redisUrl, { lazyConnect: true });
    client.on('error', (error) => errors.push(error));
    await client.connect();
    await client.cluster('ADDSLOTS', ...Array.from({ length: 16384 }, (_, slot) => slot));
    await vi.waitFor(
      async () => {
        assert.include(await client.cluster('INFO'), 'cluster_state:ok');
      },
      { timeout: 10_000, interval: 50 },
    );
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await Promise.all(
      queues.splice(0).map(async (queue) => {
        try {
          await queue.obliterate();
        } finally {
          await queue.close();
        }
      }),
    );
    errors.length = 0;
  });

  afterAll(async () => {
    client?.disconnect();
    if (redisProcess?.exitCode === null && redisProcess.signalCode === null) {
      const exited = once(redisProcess, 'exit');
      redisProcess.kill('SIGTERM');
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  });

  function createQueue() {
    const name = randomUUID();
    const queue = new Queue<{ value: number }, number>(name, {
      redisUrl,
      redisMode: 'cluster',
    });
    queue.on('error', (error) => errors.push(error));
    queues.push(queue);
    return { name, queue };
  }

  function worker(name: string, processor: (value: number) => Promise<number>, autorun = true) {
    const worker = new Worker<{ value: number }, number>(
      name,
      async (job) => processor(job.data.value),
      {
        redisUrl,
        redisMode: 'cluster',
        autorun,
      },
    );
    worker.on('error', (error) => errors.push(error));
    workers.push(worker);
    return worker;
  }

  it('processes a job through the cluster client', async () => {
    const { name, queue } = createQueue();
    const job = await queue.add('work', { value: 1 });
    const processor = vi.fn(async (value: number) => value + 1);
    worker(name, processor);
    await vi.waitFor(
      async () => {
        const status = await queue.getJobStatus(job.id);
        expect(status.state).toBe('completed');
        expect(status.job?.returnvalue).toBe(2);
      },
      { timeout: 5000 },
    );
    expect(processor).toHaveBeenCalledExactlyOnceWith(1);
    expect(errors).toEqual([]);
  });

  it('does not replay a job allocation after its connection loses the reply', async () => {
    const { queue } = createQueue();
    await queue.add('warmup', { value: 0 });
    const cluster = Reflect.get(queue, 'client') as Cluster<'legacy'>;
    const [primary] = cluster.nodes('master');
    const disconnected = once(primary, 'close');
    const sendCommand = primary.sendCommand.bind(primary);
    const send = vi.spyOn(primary, 'sendCommand').mockImplementation((command, commandStream) => {
      if (command.args.includes('lost-reply')) {
        const resolve = command.resolve;
        const stream = primary.stream;
        command.resolve = () => {
          command.resolve = resolve;
          stream.destroy();
          command.reject(new Error('Connection is closed.'));
        };
        send.mockRestore();
      }
      return sendCommand(command, commandStream);
    });

    try {
      await expect(queue.add('lost-reply', { value: 1 })).rejects.toThrow('Connection is closed.');
    } finally {
      send.mockRestore();
    }
    await disconnected;
    await vi.waitFor(
      async () => {
        expect((await queue.getJobCounts()).waiting).toBe(2);
      },
      { timeout: 5000 },
    );
    const next = await queue.add('next', { value: 2 });

    expect(next.id).toBe('3');
    expect((await queue.getJobCounts()).waiting).toBe(3);
    expect((await queue.getJobStatus('2')).job?.name).toBe('lost-reply');
  });

  it('cancels a timed-out blocking wait and processes jobs after reconnecting', async () => {
    const { name, queue } = createQueue();
    const processor = vi.fn(async (value: number) => value);
    const activeWorker = worker(name, processor, false);
    const blockingClient = Reflect.get(activeWorker, 'blockingClient') as Cluster<'legacy'>;
    await vi.waitFor(
      () => {
        expect(blockingClient.nodes('master').map((node) => node.status)).toEqual(['ready']);
      },
      { timeout: 5000 },
    );
    const blpop = blockingClient.blpop.bind(blockingClient);
    let blockedStream!: Redis['stream'];
    const pop = vi.spyOn(blockingClient, 'blpop').mockImplementationOnce((...args) => {
      const [primary] = blockingClient.nodes('master');
      primary.options.commandTimeout = 100;
      blockedStream = primary.stream;
      // Writes still reach Redis, leaving a real server-side BLPOP to cancel.
      blockedStream.pause();
      return blpop(...args);
    });

    try {
      activeWorker.run();
      await activeWorker.waitUntilReady();
      await vi.waitFor(
        () => {
          expect(errors.map((error) => error.message)).toEqual(['Command timed out']);
        },
        { timeout: 5000 },
      );
      expect(blockedStream.destroyed).toBe(true);
    } finally {
      pop.mockRestore();
    }
    const job = await queue.add('after reconnect', { value: 1 });
    await vi.waitFor(
      async () => {
        expect((await queue.getJobStatus(job.id)).state).toBe('completed');
      },
      { timeout: 5000 },
    );

    expect(processor).toHaveBeenCalledOnce();
  });
});
