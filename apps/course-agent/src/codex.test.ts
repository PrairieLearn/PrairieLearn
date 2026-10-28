import { describe, expect, it } from 'vitest';

import { CodexAppServerClient } from './codex.js';
import { SandboxTurn } from './sandbox-turn.js';
import type { CourseSandbox } from './sandbox.js';

const turn = { id: 'turn', status: 'inProgress', error: null };

function runner({
  loseAcceptance = false,
  threadResult = { thread: { id: 'thread' } },
}: { loseAcceptance?: boolean; threadResult?: unknown } = {}) {
  const commands: { id: number; method: string; params: unknown }[] = [];
  const emit = (frame: unknown) =>
    socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
  let interruptFails = false;
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
      if (frame.method === 'turn/interrupt' && interruptFails) {
        throw new Error('Lost native connection');
      }
      if (frame.method === 'initialize') {
        emit({
          id: frame.id,
          result: {},
        });
      }
      if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        emit({ id: frame.id, result: threadResult });
      }
      if (frame.method === 'turn/start' && !loseAcceptance) {
        emit({ id: frame.id, result: { turn } });
      }
      if (frame.method === 'turn/interrupt') emit({ id: frame.id, result: {} });
    },
  });
  const sandbox = {
    fetch: async () => ({ status: 101, webSocket: socket }),
  } as unknown as DurableObjectStub<CourseSandbox>;
  return {
    sandbox,
    native: new CodexAppServerClient(sandbox, 'assistant'),
    commands,
    emit,
    disconnect: () => socket.close(),
    failInterrupt: () => {
      interruptFails = true;
    },
  };
}

describe('Codex native stream', () => {
  it('rejects invalid native results before submitting a turn', async () => {
    const { native, commands } = runner({ threadResult: { thread: { id: 123 } } });
    await native.connect();
    await expect(
      native.thread({ model: 'test', instructions: 'Edit course', threadId: null }),
    ).rejects.toThrow('Invalid result for thread/start');
    await expect(native.finished).rejects.toThrow('Invalid result for thread/start');
    expect(commands.map((command) => command.method)).toEqual([
      'initialize',
      'initialized',
      'thread/start',
    ]);
  });

  it('rejects malformed subscribed notifications', async () => {
    const { native, emit } = runner();
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread', turnId: 'turn', itemId: 'item', delta: 123 },
    });
    await expect(native.finished).rejects.toThrow('Invalid notification: item/agentMessage/delta');
  });

  it('waits for terminal confirmation after SDK cancellation and interrupt acknowledgement', async () => {
    const { native, commands, emit, disconnect } = runner();
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const accepted: string[] = [];
    await native.run('New input only', (id) => accepted.push(id));
    expect(accepted).toEqual(['turn']);
    let interrupted = false;
    const stop = native.interrupt().then(() => {
      interrupted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commands.at(-1)?.method).toBe('turn/interrupt');
    expect(interrupted).toBe(false);
    await native.stream.cancel();
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { ...turn, status: 'interrupted' } },
    });
    await stop;
    native.closeStream();
    disconnect();
  });

  it('does not repeat submission when the acceptance response is lost', async () => {
    const { native, commands, disconnect } = runner({ loseAcceptance: true });
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const submission = native.run('Edit', () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    disconnect();
    await expect(submission).rejects.toThrow();
    await expect(native.finished).rejects.toThrow('disconnected');
    expect(commands.filter((command) => command.method === 'turn/start')).toHaveLength(1);
  });
});

describe('Sandbox turn cancellation', () => {
  it('does not submit after Stop during preparation and waits for process cleanup', async () => {
    const { sandbox, commands } = runner();
    const prepared = Promise.withResolvers<undefined>();
    const cleaned = Promise.withResolvers<undefined>();
    const cleaning = Promise.withResolvers<undefined>();
    sandbox.stopProcesses = async () => {
      cleaning.resolve(undefined);
      await cleaned.promise;
    };
    const turn = new SandboxTurn(sandbox, {
      messageId: 'assistant',
      text: 'Do not submit',
      startup: true,
      prepare: () => prepared.promise,
      thread: { model: 'test', instructions: 'Edit course', threadId: null },
      onThread: () => {},
      onReady: () => {},
      onAccepted: () => {},
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

  it('settles the response when interruption and process cleanup both fail', async () => {
    const { sandbox, failInterrupt } = runner();
    failInterrupt();
    sandbox.stopProcesses = async () => {
      throw new Error('Could not stop processes');
    };
    const accepted = Promise.withResolvers<undefined>();
    const turn = new SandboxTurn(sandbox, {
      messageId: 'assistant',
      text: 'Edit',
      startup: false,
      prepare: async () => {},
      thread: { model: 'test', instructions: 'Edit course', threadId: null },
      onThread: () => {},
      onReady: () => {},
      onAccepted: () => accepted.resolve(undefined),
    });
    await accepted.promise;
    await expect(turn.stop()).rejects.toThrow('Could not stop processes');
    expect(await turn.finished).toMatchObject({
      phase: 'execution',
      stopped: true,
      error: new Error('Could not stop processes'),
    });
  });
});
