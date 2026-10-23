import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { type AddressInfo, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** A real Worker with a controllable producer and its own SDK SQLite storage. */
export async function startScriptedAgent() {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    socket.close((err) => (err ? reject(err) : resolve())),
  );
  const storage = await mkdtemp(path.join(tmpdir(), 'course-agent-http-'));
  const url = `http://127.0.0.1:${port}`;
  const headers = { Authorization: 'Bearer scripted-local-test-only' };
  let child: ReturnType<typeof spawn>;
  let logs = '';

  async function start() {
    child = spawn(
      path.resolve(import.meta.dirname, '../../../../course-agent/node_modules/.bin/wrangler'),
      [
        'dev',
        '--config',
        path.resolve(import.meta.dirname, '../../../../course-agent/test/wrangler.jsonc'),
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--persist-to',
        storage,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    child.stdout?.on('data', (chunk) => {
      logs = (logs + String(chunk)).slice(-15000);
    });
    child.stderr?.on('data', (chunk) => {
      logs = (logs + String(chunk)).slice(-15000);
    });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(url)).status === 401) return;
      } catch {
        /* The listener is not ready yet. */
      }
      if (child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Scripted Worker did not start: ${logs}`);
  }

  async function stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  try {
    await start();
  } catch (err) {
    await stop();
    await rm(storage, { recursive: true, force: true });
    throw err;
  }
  return {
    url,
    headers,
    async create() {
      const response = await fetch(`${url}/conversations`, { method: 'POST', headers });
      if (!response.ok) throw new Error(`Create failed: ${await response.text()}`);
      return ((await response.json()) as { id: string }).id;
    },
    async control(id: string, action: 'advance' | 'finish' | 'fail' | 'stats', text?: string) {
      const response = await fetch(`${url}/__test/${id}/${action}`, {
        method: 'POST',
        headers,
        body: text,
      });
      if (!response.ok) throw new Error(`Scripted control failed: ${await response.text()}`);
      return (await response.json()) as { calls: number; ready: boolean };
    },
    async restart() {
      await stop();
      await start();
    },
    async close() {
      await stop();
      await rm(storage, { recursive: true, force: true });
    },
  };
}
