import type { UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';
import { SandboxTurn } from './turn.js';

/** `history` lists thread items newest first, as thread/items/list returns them. */
function runner({ loseAcceptance = false, history = [] as unknown[] } = {}) {
  const commands: { id: number; method: string; params: unknown }[] = [];
  const emit = (frame: unknown) =>
    socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
  let closed = false;
  const socket = Object.assign(new EventTarget(), {
    accept() {},
    close() {
      if (closed) return;
      closed = true;
      socket.dispatchEvent(new Event('close'));
    },
    send(text: string) {
      const frame = JSON.parse(text) as { id: number; method: string; params: unknown };
      commands.push(frame);
      if (frame.method === 'initialize') emit({ id: frame.id, result: {} });
      if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        emit({ id: frame.id, result: { thread: { id: 'thread' } } });
      }
      if (frame.method === 'thread/items/list') {
        emit({
          id: frame.id,
          result: {
            data: history.map((item) => ({ turnId: 'earlier', item })),
            nextCursor: null,
          },
        });
      }
      if (frame.method === 'turn/start' && !loseAcceptance) {
        emit({ id: frame.id, result: { turn: { id: 'turn' } } });
      }
      if (frame.method === 'turn/interrupt') {
        emit({ id: frame.id, result: {} });
        emit({
          method: 'turn/completed',
          params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted', error: null } },
        });
      }
    },
  });
  const sandbox = {
    fetch: vi.fn(async () => ({ status: 101, webSocket: socket })),
    stopProcesses: vi.fn(async () => {}),
  } as unknown as DurableObjectStub<CourseSandbox>;
  const native = new CodexAppServerClient(sandbox);
  return { sandbox, native, commands, emit, disconnect: () => socket.close() };
}

const thread = { model: 'test', instructions: 'Edit course', threadId: null };

function options(onAccepted: () => void, threadId: string | null = null) {
  return {
    messageId: crypto.randomUUID(),
    input: { tag: 'message:prompt', text: 'Edit my question' },
    startup: false,
    prepare: async () => {},
    thread: { ...thread, threadId },
    onThread: () => {},
    onReady: () => {},
    onAccepted,
    log: () => {},
  };
}

describe('course agent turns', () => {
  it('submits a tagged result once, even if an earlier acknowledgment was lost', async () => {
    const delivery = { tag: 'review:1', once: true, text: 'The review finished.' };
    const delivered = runner({
      history: [
        { type: 'agentMessage', id: 'reply', text: 'Thanks.' },
        { type: 'userMessage', id: 'result', clientId: 'review:1', content: [] },
      ],
    });
    delivered.native.beginTurn('assistant');
    await delivered.native.connect();
    await delivered.native.thread({ ...thread, threadId: 'thread' });
    const accepted = vi.fn();
    await delivered.native.run(delivery, accepted);
    await delivered.native.finished;
    expect(accepted).toHaveBeenCalledWith(null);
    expect(delivered.commands.filter((command) => command.method === 'turn/start')).toEqual([]);
    delivered.native.closeStream();
    delivered.disconnect();

    // The same text with an earlier result on the thread is a new delivery.
    const pending = runner({
      history: [{ type: 'userMessage', id: 'prompt', clientId: 'review:0', content: [] }],
    });
    pending.native.beginTurn('assistant');
    await pending.native.connect();
    await pending.native.thread({ ...thread, threadId: 'thread' });
    await pending.native.run(delivery, () => {});
    expect(pending.commands.filter((command) => command.method === 'turn/start')).toEqual([
      {
        id: expect.any(Number),
        method: 'turn/start',
        params: {
          threadId: 'thread',
          clientUserMessageId: 'review:1',
          input: [{ type: 'text', text: 'The review finished.', text_elements: [] }],
        },
      },
    ]);
    pending.native.closeStream();
    pending.disconnect();

    // Codex rejects history reads on a thread without user messages, which a new one never has.
    const fresh = runner({ history: [{ type: 'userMessage', id: 'x', clientId: 'review:1' }] });
    fresh.native.beginTurn('assistant');
    await fresh.native.connect();
    await fresh.native.thread(thread);
    await fresh.native.run(delivery, () => {});
    expect(fresh.commands.map((command) => command.method)).not.toContain('thread/items/list');
    expect(fresh.commands.map((command) => command.method)).toContain('turn/start');
    fresh.native.closeStream();
    fresh.disconnect();
  });

  it('resubmits a regenerated prompt and adds catch-up text to the same input', async () => {
    const { native, commands, disconnect } = runner({
      history: [{ type: 'userMessage', id: 'prompt', clientId: 'message:1', content: [] }],
    });
    native.beginTurn('assistant');
    await native.connect();
    await native.thread({ ...thread, threadId: 'thread' });
    const catchUp = vi.fn(() => 'Earlier conversation');
    await native.run({ tag: 'message:1', text: 'Edit again', catchUp }, () => {});
    expect(catchUp).toHaveBeenCalledWith('message:1');
    expect(commands.find((command) => command.method === 'turn/start')?.params).toMatchObject({
      clientUserMessageId: 'message:1',
      input: [
        { type: 'text', text: 'Earlier conversation' },
        { type: 'text', text: 'Edit again' },
      ],
    });
    native.closeStream();
    disconnect();
  });

  it('reuses the native session for follow-ups and stops processes only on explicit Stop', async () => {
    const { sandbox, native, commands, emit } = runner();
    for (const threadId of [null, 'thread']) {
      const accepted = Promise.withResolvers<undefined>();
      const turn = new SandboxTurn(
        sandbox,
        native,
        options(() => accepted.resolve(undefined), threadId),
      );
      await accepted.promise;
      emit({
        method: 'item/agentMessage/delta',
        params: {
          threadId: 'thread',
          turnId: 'turn',
          itemId: 'answer',
          delta: 'Updated your question.',
        },
      });
      emit({
        method: 'turn/completed',
        params: { threadId: 'thread', turn: { id: 'turn', status: 'completed', error: null } },
      });
      expect(await turn.finished).toEqual({ phase: 'execution', stopped: false });
      const chunks: UIMessageChunk[] = [];
      for await (const chunk of turn.stream) chunks.push(chunk);
      expect(chunks.filter((chunk) => chunk.type === 'text-delta')).toEqual([
        { type: 'text-delta', id: 'text:answer', delta: 'Updated your question.' },
      ]);
    }
    expect(sandbox.fetch).toHaveBeenCalledTimes(1);
    expect(commands.filter((command) => command.method === 'initialize')).toHaveLength(1);
    expect(sandbox.stopProcesses).not.toHaveBeenCalled();
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(
      sandbox,
      native,
      options(() => accepted.resolve(undefined), 'thread'),
    );
    await accepted.promise;
    await turn.stop();
    expect(sandbox.stopProcesses).toHaveBeenCalledTimes(1);
    expect(await turn.finished).toEqual({ phase: 'execution', stopped: true });
  });

  it('streams tool calls as parts replaced on completion, leaving reviews to the review card', async () => {
    const { sandbox, native, emit } = runner();
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(
      sandbox,
      native,
      options(() => accepted.resolve(undefined)),
    );
    await accepted.promise;
    const command = {
      type: 'commandExecution',
      id: 'ls',
      command: 'ls questions',
      commandActions: [{ type: 'listFiles', command: 'ls questions', path: 'questions' }],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    };
    const review = {
      type: 'dynamicToolCall',
      id: 'review',
      namespace: null,
      tool: 'request_changes',
      arguments: {},
      contentItems: null,
      success: null,
      durationMs: null,
    };
    const item = (method: string, item: unknown) =>
      emit({ method, params: { threadId: 'thread', turnId: 'turn', item } });
    item('item/started', { ...command, status: 'inProgress' });
    item('item/completed', {
      ...command,
      status: 'completed',
      aggregatedOutput: 'q1\n',
      exitCode: 0,
    });
    item('item/started', { ...review, status: 'inProgress' });
    item('item/completed', { ...review, status: 'completed', success: true });
    item('item/completed', {
      ...review,
      id: 'empty-review',
      status: 'completed',
      success: false,
      contentItems: [{ type: 'inputText', text: 'There are no course changes to review.' }],
    });
    // A call the turn ends without reporting must not look like it is still running.
    item('item/started', { ...command, id: 'stuck', status: 'inProgress' });
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { id: 'turn', status: 'completed', error: null } },
    });
    await turn.finished;
    const chunks: UIMessageChunk[] = [];
    for await (const chunk of turn.stream) chunks.push(chunk);
    expect(chunks.filter((chunk) => chunk.type === 'data-tool')).toMatchObject([
      { id: 'tool:ls', data: { kind: 'command', status: 'running', output: null } },
      { id: 'tool:ls', data: { kind: 'command', status: 'completed', output: { text: 'q1\n' } } },
      {
        id: 'tool:empty-review',
        data: {
          kind: 'tool',
          tool: 'request_changes',
          status: 'failed',
          output: { text: 'There are no course changes to review.' },
        },
      },
      { id: 'tool:stuck', data: { status: 'running' } },
      { id: 'tool:stuck', data: { status: 'interrupted' } },
    ]);
  });

  it('keeps only labels for tool calls past the message budget', async () => {
    const { sandbox, native, emit } = runner();
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(
      sandbox,
      native,
      options(() => accepted.resolve(undefined)),
    );
    await accepted.promise;
    // About 4 KB of history each, so 100 calls exceed the 300,000-character budget.
    for (let i = 0; i < 100; i++) {
      emit({
        method: 'item/completed',
        params: {
          threadId: 'thread',
          turnId: 'turn',
          item: {
            type: 'commandExecution',
            id: `cmd${i}`,
            command: 'seq 1 5000',
            status: 'completed',
            commandActions: [{ type: 'unknown', command: 'seq 1 5000' }],
            aggregatedOutput: 'x'.repeat(10_000),
            exitCode: 0,
            durationMs: null,
          },
        },
      });
    }
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { id: 'turn', status: 'completed', error: null } },
    });
    await turn.finished;
    const outputs: unknown[] = [];
    for await (const chunk of turn.stream) {
      if (chunk.type === 'data-tool') outputs.push((chunk.data as { output: unknown }).output);
    }
    expect(outputs[0]).toMatchObject({ omitted: 6_000 });
    expect(outputs.at(-1)).toEqual({ text: '', omitted: 10_000 });
  });

  it('never resubmits a prompt whose acceptance response was lost', async () => {
    const { native, commands, disconnect } = runner({ loseAcceptance: true });
    native.beginTurn('assistant');
    await native.connect();
    await native.thread(thread);
    const submission = native.run({ tag: 'message:edit', text: 'Edit' }, () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    disconnect();
    await expect(submission).rejects.toThrow();
    await expect(native.finished).rejects.toThrow('disconnected');
    expect(commands.filter((command) => command.method === 'turn/start')).toHaveLength(1);
  });

  it('does not submit after Stop during startup and waits for cleanup', async () => {
    const { sandbox, native, commands } = runner();
    const prepared = Promise.withResolvers<undefined>();
    const cleaning = Promise.withResolvers<undefined>();
    const cleaned = Promise.withResolvers<undefined>();
    sandbox.stopProcesses = async () => {
      cleaning.resolve(undefined);
      await cleaned.promise;
    };
    const turn = new SandboxTurn(sandbox, native, {
      ...options(() => {}),
      startup: true,
      prepare: () => prepared.promise,
    });
    let stopped = false;
    const stop = turn.stop().then(() => {
      stopped = true;
    });
    await turn.stream.cancel();
    prepared.resolve(undefined);
    await cleaning.promise;
    expect(commands).toEqual([]);
    expect(stopped).toBe(false);
    cleaned.resolve(undefined);
    await stop;
    expect(await turn.finished).toEqual({ phase: 'startup', stopped: true });
  });

  it('waits for the runner before cleaning up a failed clone and never starts a thread', async () => {
    const { sandbox, native, commands } = runner();
    const connecting = Promise.withResolvers<undefined>();
    const fetch = sandbox.fetch;
    sandbox.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
      await connecting.promise;
      return fetch(...args);
    }) as typeof fetch;
    const events: string[] = [];
    sandbox.stopProcesses = vi.fn(async () => {
      events.push('cleanup');
    });
    const turn = new SandboxTurn(sandbox, native, {
      ...options(() => {}),
      startup: true,
      addCourseFiles: async () => {
        events.push('clone failed');
        throw new Error('Clone failed');
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    events.push('runner connected');
    connecting.resolve(undefined);
    expect(await turn.finished).toEqual({
      phase: 'startup',
      stopped: false,
      error: new Error('Clone failed'),
    });
    expect(events).toEqual(['clone failed', 'runner connected', 'cleanup']);
    expect(commands.some((command) => command.method.startsWith('thread/'))).toBe(false);
  });

  it('settles a failed Stop instead of waiting forever for native output', async () => {
    const { sandbox, native, disconnect } = runner();
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(
      sandbox,
      native,
      options(() => accepted.resolve(undefined)),
    );
    await accepted.promise;
    sandbox.stopProcesses = async () => {
      throw new Error('Could not stop processes');
    };
    disconnect();
    await expect(turn.stop()).rejects.toThrow('Could not stop processes');
    expect(await turn.finished).toMatchObject({
      stopped: true,
      error: new Error('Could not stop processes'),
    });
  });
});
