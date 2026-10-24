import { describe, expect, it } from 'vitest';

import { Codex } from './codex.js';
import { SandboxTurn } from './sandbox-turn.js';
import type { CourseSandbox } from './sandbox.js';

function runner(loseAcceptance = false) {
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const commands: { id: number; method: string; params: unknown }[] = [];
  const emit = (frame: unknown) =>
    output.enqueue(new TextEncoder().encode(`${JSON.stringify(frame)}\n`));
  const sandbox = {
    openNative: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            output = controller;
          },
        }),
      ),
    command: async (text: string) => {
      const frame = JSON.parse(text) as { id: number; method: string; params: unknown };
      commands.push(frame);
      if (frame.method === 'initialize') emit({ id: frame.id, result: {} });
      if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        emit({ id: frame.id, result: { thread: { id: 'thread' } } });
      }
      if (frame.method === 'turn/start' && !loseAcceptance) {
        emit({ id: frame.id, result: { turn: { id: 'turn' } } });
      }
      if (frame.method === 'turn/interrupt') emit({ id: frame.id, result: {} });
    },
  } as unknown as DurableObjectStub<CourseSandbox>;
  return {
    sandbox,
    native: new Codex(sandbox, 'assistant'),
    commands,
    emit,
    disconnect: () => output.close(),
  };
}

describe('Codex native stream', () => {
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
      params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted' } },
    });
    await stop;
    native.closeStream();
    disconnect();
  });

  it('does not repeat submission when the acceptance response is lost', async () => {
    const { native, commands, disconnect } = runner(true);
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const submission = native.run('Edit', () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    disconnect();
    await expect(submission).rejects.toThrow('disconnected');
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
    const { sandbox } = runner();
    const command = sandbox.command;
    sandbox.command = async (frame) => {
      if (JSON.parse(frame).method === 'turn/interrupt') throw new Error('Lost native connection');
      await command(frame);
    };
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
