import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ requests: [], resumeError: false, turnError: false }));
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {
      child.stdout.end();
      child.emit('close', 0);
    };
    child.stdin.on('data', (chunk) => {
      const request = JSON.parse(chunk.toString());
      mock.requests.push(request);
      const reply = (message) =>
        setImmediate(() => child.stdout.write(`${JSON.stringify(message)}\n`));
      if (request.method === 'initialize') reply({ id: request.id, result: {} });
      if (request.method === 'thread/start' || request.method === 'thread/resume') {
        reply(
          mock.resumeError && request.method === 'thread/resume'
            ? { id: request.id, error: { message: 'Saved session is unavailable' } }
            : { id: request.id, result: { thread: { id: 'test-thread' } } },
        );
      }
      if (request.method === 'turn/start') {
        reply({
          method: 'turn/completed',
          params: {
            threadId: 'test-thread',
            turn: { status: mock.turnError ? 'failed' : 'completed' },
          },
        });
      }
    });
    return child;
  },
}));

import { runCodex } from './run-codex.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true })));
  directories.length = 0;
  mock.requests = [];
  mock.resumeError = false;
  mock.turnError = false;
});

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'pl-codex-session-test-'));
  directories.push(cwd);
  return { cwd, model: 'mock-model', emit: () => {} };
}

it('starts once, then resumes without replaying previous messages', async () => {
  const options = await fixture();
  const history = [
    { role: 'user', text: 'a'.repeat(25_000) },
    { role: 'assistant', text: 'Earlier answer' },
  ];
  await runCodex({ ...options, prompt: 'First request', history });
  await runCodex({ ...options, prompt: 'Next request', history });
  expect(mock.requests.filter((request) => request.method === 'thread/start')).toHaveLength(1);
  expect(mock.requests.find((request) => request.method === 'thread/start').params.ephemeral).toBe(
    false,
  );
  expect(mock.requests.find((request) => request.method === 'thread/resume').params.threadId).toBe(
    'test-thread',
  );
  const turns = mock.requests.filter((request) => request.method === 'turn/start');
  expect(turns[0].params.input[0].text).toContain(JSON.stringify(history));
  expect(turns[1].params.input[0].text).toBe('Next request');
  expect(
    JSON.parse(
      await readFile(join(options.cwd, '.course-agent/codex/course-agent-thread.json'), 'utf8'),
    ),
  ).toEqual({ threadId: 'test-thread' });
});

it('keeps the thread after a failed turn and does not silently replace a failed resume', async () => {
  const options = await fixture();
  mock.turnError = true;
  await expect(runCodex({ ...options, prompt: 'First request' })).rejects.toThrow(
    'Agent turn did not complete',
  );
  mock.turnError = false;
  mock.resumeError = true;
  await expect(runCodex({ ...options, prompt: 'Try again' })).rejects.toThrow(
    'Saved session is unavailable',
  );
  expect(mock.requests.filter((request) => request.method === 'thread/start')).toHaveLength(1);
});
