import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Cluster, Redis } from 'ioredis';
import { afterAll, afterEach, assert, beforeAll, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PREFIX, QueueKeys } from './keys.js';
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
  const processes: ChildProcessWithoutNullStreams[] = [];
  const nodes: { port: number; busPort: number; client: Redis }[] = [];
  const queues: Queue<{ value: number }, number>[] = [];
  const workers: Worker<{ value: number }, number>[] = [];
  const errors: Error[] = [];

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'prairiemq-cluster-'));
    const ports = await freePorts(6);
    await Promise.all(
      Array.from({ length: 3 }, async (_, index) => {
        const nodeDirectory = join(directory, String(index));
        await mkdir(nodeDirectory);
        const port = ports[index * 2];
        const busPort = ports[index * 2 + 1];
        const process = spawn('redis-server', [
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
          nodeDirectory,
          '--save',
          '',
          '--appendonly',
          'no',
        ]);
        processes.push(process);
        await new Promise<void>((resolve, reject) => {
          let output = '';
          process.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            if (output.includes('Ready to accept connections')) resolve();
          });
          process.stderr.on('data', (chunk: Buffer) => {
            output += chunk.toString();
          });
          process.once('error', reject);
          process.once('exit', (code) => {
            reject(new Error(`Redis Cluster node exited with code ${code}: ${output}`));
          });
        });
        const client = new Redis<'legacy'>({ host: '127.0.0.1', port, lazyConnect: true });
        client.on('error', (error) => errors.push(error));
        nodes[index] = { port, busPort, client };
        await client.connect();
        const start = Math.floor((index * 16384) / 3);
        const end = Math.floor(((index + 1) * 16384) / 3);
        await client.cluster(
          'ADDSLOTS',
          ...Array.from({ length: end - start }, (_, slot) => start + slot),
        );
      }),
    );
    await Promise.all(
      nodes
        .slice(1)
        .map(({ port, busPort }) => nodes[0].client.cluster('MEET', '127.0.0.1', port, busPort)),
    );
    await vi.waitFor(
      async () => {
        for (const { client } of nodes) {
          assert.include(await client.cluster('INFO'), 'cluster_state:ok');
        }
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
    for (const { client } of nodes) client.disconnect();
    await Promise.all(
      processes.map(async (process) => {
        if (process.exitCode !== null || process.signalCode !== null) return;
        const exited = once(process, 'exit');
        process.kill('SIGTERM');
        await exited;
      }),
    );
    await rm(directory, { recursive: true, force: true });
  });

  async function queuesOnEveryPrimary() {
    const names: string[] = [];
    const prefix = randomUUID();
    for (let index = 0; names.filter(Boolean).length < nodes.length; index++) {
      const name = `${prefix}-${index}`;
      const slot = await nodes[0].client.cluster(
        'KEYSLOT',
        new QueueKeys(DEFAULT_PREFIX, name).base,
      );
      const primary = nodes.findIndex(
        (_, index) => slot < Math.floor(((index + 1) * 16384) / nodes.length),
      );
      names[primary] ??= name;
    }
    return names.map((name) => {
      const queue = new Queue<{ value: number }, number>(name, {
        redisUrl: `redis://127.0.0.1:${nodes[0].port}`,
        redisMode: 'cluster',
      });
      queue.on('error', (error) => errors.push(error));
      queues.push(queue);
      return { name, queue };
    });
  }

  function worker(
    name: string,
    processor: (value: number, failures: number) => Promise<number>,
    autorun = true,
  ) {
    const worker = new Worker<{ value: number }, number>(
      name,
      async (job) => processor(job.data.value, job.failedAttempts),
      { redisUrl: `redis://127.0.0.1:${nodes[0].port}`, redisMode: 'cluster', autorun },
    );
    worker.on('error', (error) => errors.push(error));
    workers.push(worker);
    return worker;
  }

  it('routes jobs to every primary and completes a delayed retry', async () => {
    const targets = await queuesOnEveryPrimary();
    const jobs = await Promise.all(
      targets.map(async ({ name, queue }, index) => {
        const job = await queue.add(
          'work',
          { value: index },
          {
            delay: 50,
            attempts: 2,
            backoff: { type: 'fixed', delay: 100 },
          },
        );
        worker(name, async (value, failures) => {
          if (value === 1 && failures === 0) throw new Error('Retry this job');
          return value + 1;
        });
        return job;
      }),
    );

    await vi.waitFor(
      async () => {
        for (const [index, { queue }] of targets.entries()) {
          const status = await queue.getJobStatus(jobs[index].id);
          expect(status.state).toBe('completed');
          expect(status.job).toMatchObject({
            returnvalue: index + 1,
            failedAttempts: index === 1 ? 1 : 0,
          });
        }
      },
      { timeout: 5000 },
    );
    expect(errors).toEqual([]);
  });

  it('resumes a paused queue and removes its keys without affecting other queues', async () => {
    const targets = await queuesOnEveryPrimary();
    const retained = await targets[0].queue.add('retained', { value: 1 });
    const { name, queue } = targets[2];
    await queue.pause();
    const job = await queue.add('paused', { value: 2 });
    const processor = vi.fn(async (value: number) => value);
    await worker(name, processor).waitUntilReady();
    expect(processor).not.toHaveBeenCalled();
    expect((await queue.getJobStatus(job.id)).state).toBe('waiting');

    await queue.resume();
    await vi.waitFor(
      async () => {
        expect((await queue.getJobStatus(job.id)).state).toBe('completed');
      },
      { timeout: 5000 },
    );
    await workers.pop()!.close();
    await queue.obliterate();

    expect((await queue.getJobStatus(job.id)).state).toBe('unknown');
    expect((await targets[0].queue.getJobStatus(retained.id)).state).toBe('waiting');
    expect(errors).toEqual([]);
  });

  it('does not replay a job allocation after its connection loses the reply', async () => {
    const [{ queue }] = await queuesOnEveryPrimary();
    await queue.add('warmup', { value: 0 });
    const cluster = Reflect.get(queue, 'client') as Cluster<'legacy'>;
    const primary = cluster.nodes('master').find((node) => node.options.port === nodes[0].port)!;
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
    await vi.waitFor(() => queue.waitUntilReady(), { timeout: 5000 });
    const next = await queue.add('next', { value: 2 });

    expect(next.id).toBe('3');
    expect((await queue.getJobCounts()).waiting).toBe(3);
    expect((await queue.getJobStatus('2')).job?.name).toBe('lost-reply');
  });

  it('cancels a timed-out blocking wait and processes jobs after reconnecting', async () => {
    const [{ name, queue }] = await queuesOnEveryPrimary();
    const processor = vi.fn(async (value: number) => value);
    const activeWorker = worker(name, processor, false);
    const blockingClient = Reflect.get(activeWorker, 'blockingClient') as Cluster<'legacy'>;
    await vi.waitFor(
      () => {
        expect(blockingClient.nodes('master').map((node) => node.status)).toEqual([
          'ready',
          'ready',
          'ready',
        ]);
      },
      { timeout: 5000 },
    );
    const blpop = blockingClient.blpop.bind(blockingClient);
    let blockedStream!: Redis['stream'];
    const pop = vi.spyOn(blockingClient, 'blpop').mockImplementationOnce((...args) => {
      const primary = blockingClient
        .nodes('master')
        .find((node) => node.options.port === nodes[0].port)!;
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
