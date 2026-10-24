const report = (...values) => process.stdout.write(values.join(' ') + '\n');
// Runs the real pinned app-server against a local scripted Responses endpoint.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const dir = await mkdtemp(path.join(tmpdir(), 'push-sync-native-'));
await build({
  entryPoints: [path.join(root, 'src/codex.ts')],
  conditions: ['browser'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(dir, 'adapter.mjs'),
});
const { CodexAppServerClient } = await import(pathToFileURL(path.join(dir, 'adapter.mjs')).href);
await mkdir(`${dir}/home`);
await mkdir(`${dir}/course`);
const requests = [];
let mode = 'call';
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push(body);
  const item =
    mode === 'call'
      ? {
          type: 'function_call',
          id: 'fc_test',
          call_id: 'review_call',
          name: 'push_sync',
          arguments: '{}',
        }
      : {
          type: 'message',
          id: 'msg_test',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Result received.', annotations: [] }],
        };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const event = (type, data) =>
    res.write(`event: ${type}
data: ${JSON.stringify({ type, ...data })}

`);
  event('response.created', { response: { id: 'resp_test', status: 'in_progress', output: [] } });
  event('response.output_item.added', { output_index: 0, item });
  if (item.type === 'message') {
    event('response.output_text.delta', {
      item_id: item.id,
      output_index: 0,
      content_index: 0,
      delta: 'Result received.',
    });
  }
  event('response.output_item.done', { output_index: 0, item });
  event('response.completed', {
    response: {
      id: 'resp_test',
      status: 'completed',
      output: [item],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    },
  });
  res.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
await writeFile(
  `${dir}/home/config.toml`,
  `model_provider = "scripted"
[model_providers.scripted]
name = "Scripted"
base_url = "http://127.0.0.1:${address.port}/v1"
wire_api = "responses"
requires_openai_auth = false
`,
);
const cli = path.join(root, 'node_modules/@openai/codex/bin/codex.js');
let child;
let logs = '';

async function start() {
  child = spawn(process.execPath, [cli, 'app-server', '--listen', 'ws://127.0.0.1:4588'], {
    detached: true,
    cwd: `${dir}/course`,
    env: { ...process.env, CODEX_HOME: `${dir}/home` },
  });
  child.stderr.on('data', (x) => (logs += x));
  await new Promise((r) => setTimeout(r, 700));
}
const sandbox = {
  async fetch() {
    const ws = new WebSocket('ws://127.0.0.1:4588');
    await once(ws, 'open');
    const send = ws.send.bind(ws);
    ws.send = (raw) => {
      const f = JSON.parse(raw);
      if (f.params?.cwd) f.params.cwd = `${dir}/course`;
      send(JSON.stringify(f));
    };
    return { status: 101, webSocket: Object.assign(ws, { accept() {} }) };
  },
};
const result = {
  decision: 'denied',
  publication: { status: 'not_attempted' },
  sync: { status: 'not_attempted' },
};
try {
  await start();
  let resolveCall;
  const called = new Promise((r) => (resolveCall = r));
  const native = new CodexAppServerClient(sandbox, 'first', async (call2, ready) => {
    ready('a'.repeat(64));
    resolveCall(call2);
    return await new Promise(() => {});
  });
  const drain = async (client) => {
    try {
      for await (const _chunk of client.stream) {
        // Drain output while the protocol check observes native requests.
      }
    } catch {
      // Killing the native waiter intentionally disconnects its response stream.
    }
  };
  void drain(native);
  await native.connect();
  const threadId = await native.thread({
    model: 'test',
    instructions: 'Test push_sync.',
    threadId: null,
  });
  await native.run('ORIGINAL PROMPT MUST NOT REPEAT', () => {});
  const call = await Promise.race([
    called,
    new Promise((_, r) => setTimeout(() => r(new Error('No dynamic call')), 1e4)),
  ]);
  assert.equal(call.callId, 'review_call');
  process.kill(-child.pid, 'SIGKILL');
  await once(child, 'exit');
  await native.finished.catch(() => {});
  mode = 'reply';
  await start();
  const resumed = new CodexAppServerClient(sandbox, 'second');
  void drain(resumed);
  await resumed.connect();
  await resumed.thread({ model: 'test', instructions: 'Test push_sync.', threadId });
  await resumed.run({ callId: 'review_call', revision: 'a'.repeat(64), result }, () => {});
  await resumed.finished;
  resumed.closeStream();
  const body = requests.at(-1);
  assert.ok(JSON.stringify(body.input).includes('not_attempted'));
  assert.ok(
    body.input.some(
      (item) =>
        item.type === 'function_call_output' && JSON.stringify(item).includes('not_attempted'),
    ),
  );
  assert.equal(
    body.input.filter(
      (item) => item.role === 'user' && JSON.stringify(item).includes('ORIGINAL PROMPT'),
    ).length,
    1,
  );
  process.kill(-child.pid, 'SIGKILL');
  await once(child, 'exit');
  await start();
  const count = requests.length;
  const deduped = new CodexAppServerClient(sandbox, 'third');
  void drain(deduped);
  await deduped.connect();
  await deduped.thread({ model: 'test', instructions: 'Test push_sync.', threadId });
  await deduped.run({ callId: 'review_call', revision: 'a'.repeat(64), result }, () => {});
  await deduped.finished;
  deduped.closeStream();
  assert.equal(requests.length, count);
  mode = 'call';
  let continuationDone;
  const chunks = [];
  const live = new CodexAppServerClient(sandbox, 'live', async (call2, ready) => {
    ready('f'.repeat(64));
    continuationDone = (async () => {
      for await (const chunk of live.openStream()) chunks.push(chunk);
    })();
    mode = 'reply';
    return result;
  });
  const collect = (async () => {
    for await (const chunk of live.stream) chunks.push(chunk);
  })();
  await live.connect();
  await live.thread({ model: 'test', instructions: 'Test live tool.', threadId: null });
  await live.run('Call push sync once', () => {});
  await live.finished;
  live.closeStream();
  await collect;
  await continuationDone;
  assert.ok(
    chunks.some((c) => c.type === 'tool-output-available' && c.output.decision === 'denied'),
  );
  report(
    'PASS: real Codex 0.163.0 dynamic tool request, killed waiter, resumed thread, result-only tool output, no original-prompt replay.',
  );
  report('Fixture', dir);
} catch (error) {
  console.error(logs.slice(-5e3));
  throw error;
} finally {
  if (child) process.kill(-child.pid, 'SIGKILL');
  server.close();
}
