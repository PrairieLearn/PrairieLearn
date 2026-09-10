import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  requests: [],
  resumeError: false,
  turnError: false,
  requestApproval: false,
}));
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
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
        if (mock.requestApproval) {
          reply({
            id: 'tool-request',
            method: 'item/tool/call',
            params: {
              threadId: 'test-thread',
              turnId: 'test-turn',
              tool: 'push_sync',
              arguments: {},
            },
          });
          return;
        }
        reply({
          method: 'turn/completed',
          params: {
            threadId: 'test-thread',
            turn: { status: mock.turnError ? 'failed' : 'completed' },
          },
        });
      }
      if (request.method === 'turn/interrupt') {
        reply({
          method: 'turn/completed',
          params: { threadId: 'test-thread', turn: { status: 'interrupted' } },
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
  mock.requestApproval = false;
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
  const authoringContext = {
    courseInstance: { id: '91', shortName: 'Fa26', longName: 'Fall 2026' },
  };
  await runCodex({
    ...options,
    prompt: 'First request',
    request: 'First request',
    history,
    authoringContext,
  });
  await runCodex({
    ...options,
    prompt: 'Next request',
    request: 'Next request',
    history,
    authoringContext,
  });
  expect(mock.requests.filter((request) => request.method === 'thread/start')).toHaveLength(1);
  expect(mock.requests.find((request) => request.method === 'thread/start').params.ephemeral).toBe(
    false,
  );
  expect(mock.requests.find((request) => request.method === 'thread/resume').params.threadId).toBe(
    'test-thread',
  );
  const turns = mock.requests.filter((request) => request.method === 'turn/start');
  expect(turns[0].params.input[0].text).toContain(JSON.stringify(history));
  expect(turns[0].params.input[0].text).toContain('Current course context');
  expect(turns[0].params.input[0].text).toContain('"directory":"Fa26"');
  expect(turns[1].params.input[0].text).toContain('Next request');
  expect(turns[1].params.input[0].text).toContain('Current course context');
  expect(
    JSON.parse(
      await readFile(join(options.cwd, '.course-agent/codex/course-agent-thread.json'), 'utf8'),
    ),
  ).toEqual({ threadId: 'test-thread', configurationVersion: 3 });
});

it('replaces an incompatible thread and restores its conversation history', async () => {
  const options = await fixture();
  const codexHome = join(options.cwd, '.course-agent/codex');
  await mkdir(codexHome, { recursive: true });
  await writeFile(
    join(codexHome, 'course-agent-thread.json'),
    JSON.stringify({ threadId: 'legacy-thread' }),
  );
  const history = [{ role: 'user', text: 'Earlier request' }];

  await runCodex({ ...options, prompt: 'Current request', history });

  expect(mock.requests.filter((request) => request.method === 'thread/resume')).toHaveLength(0);
  expect(mock.requests.filter((request) => request.method === 'thread/start')).toHaveLength(1);
  expect(
    mock.requests.find((request) => request.method === 'turn/start').params.input[0].text,
  ).toContain(JSON.stringify(history));
  expect(JSON.parse(await readFile(join(codexHome, 'course-agent-thread.json'), 'utf8'))).toEqual({
    threadId: 'test-thread',
    configurationVersion: 3,
  });
});

it('tells Codex to invoke course-agent tools instead of shell commands', async () => {
  const options = await fixture();

  await runCodex({ ...options, prompt: 'Request push approval' });

  const instructions = mock.requests.find((request) => request.method === 'thread/start').params
    .developerInstructions;
  expect(instructions).toContain('invoke `push_sync` as a tool');
  expect(instructions).toContain('Do not invent separate validation or rendering tools');
  expect(instructions).toContain('Never push directly');
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

it('pauses a dynamic tool and resumes its result without fabricating a user message', async () => {
  const options = await fixture();
  const events = [];
  mock.requestApproval = true;
  await runCodex({
    ...options,
    prompt: 'Publish this change',
    requestApproval: async () => 'approval-1',
    emit: (event) => events.push(event),
  });
  expect(events.at(-1)).toEqual({
    method: 'course_agent/approvalPaused',
    params: { approvalId: 'approval-1' },
  });
  expect(
    mock.requests.find((request) => request.method === 'thread/start').params.dynamicTools[0].name,
  ).toBe('push_sync');
  expect(mock.requests.some((request) => request.id === 'tool-request')).toBe(false);
  mock.requestApproval = false;
  const continuation = { approvalId: 'approval-1', ok: true, commitSha: 'published' };
  await runCodex({ ...options, prompt: '', continuation });
  expect(mock.requests.filter((request) => request.method === 'turn/start').at(-1).params).toEqual({
    threadId: 'test-thread',
    input: [],
    toolOutput: { name: 'push_sync', output: JSON.stringify(continuation) },
  });
  await expect(runCodex({ ...options, prompt: '', continuation })).rejects.toThrow(
    'continuation is unavailable',
  );
});

it('refuses to replace a missing approval continuation with a new conversation', async () => {
  const options = await fixture();
  await expect(
    runCodex({ ...options, prompt: '', continuation: { approvalId: 'missing' } }),
  ).rejects.toThrow('continuation is unavailable');
  expect(mock.requests).toHaveLength(0);
});
