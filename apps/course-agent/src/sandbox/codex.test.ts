import type { UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';
import { SandboxTurn } from './turn.js';

function runner({ loseAcceptance = false } = {}) {
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
    text: 'Edit my question',
    startup: false,
    prepare: async () => {},
    thread: { ...thread, threadId },
    onThread: () => {},
    onReady: () => {},
    onAccepted,
  };
}

describe('course agent turns', () => {
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

  it('never resubmits a prompt whose acceptance response was lost', async () => {
    const { native, commands, disconnect } = runner({ loseAcceptance: true });
    native.beginTurn('assistant');
    await native.connect();
    await native.thread(thread);
    const submission = native.run('Edit', () => {});
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
