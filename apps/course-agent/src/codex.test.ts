import { describe, expect, it } from 'vitest';

import { Codex } from './codex.js';
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
  return { native: new Codex(sandbox), commands, emit, disconnect: () => output.close() };
}

describe('Codex native stream', () => {
  it('waits for terminal confirmation after SDK cancellation and interrupt acknowledgement', async () => {
    const { native, commands, emit, disconnect } = runner();
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const accepted: string[] = [];
    const stream = await native.run('New input only', 'assistant', (id) => accepted.push(id));
    expect(accepted).toEqual(['turn']);
    let interrupted = false;
    const stop = native.interrupt().then(() => {
      interrupted = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commands.at(-1)?.method).toBe('turn/interrupt');
    expect(interrupted).toBe(false);
    await stream.cancel();
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { id: 'turn', status: 'interrupted' } },
    });
    await stop;
    native.closeStream();
    disconnect();
  });

  it('preserves text and reasoning under one assistant ID', async () => {
    const { native, emit, disconnect } = runner();
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: 'thread' });
    const stream = await native.run('Follow-up', 'assistant', () => {});
    emit({
      method: 'item/reasoning/summaryTextDelta',
      params: { threadId: 'thread', itemId: 'r', delta: 'Checking files' },
    });
    emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'other-thread', itemId: 'ignore', delta: 'Private' },
    });
    emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread', itemId: 'a', delta: 'Edited' },
    });
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { id: 'turn', status: 'completed' } },
    });
    await native.finished;
    native.closeStream();
    const chunks = [];
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks).toEqual([
      { type: 'start', messageId: 'assistant' },
      { type: 'reasoning-start', id: 'reasoning:r' },
      { type: 'reasoning-delta', id: 'reasoning:r', delta: 'Checking files' },
      { type: 'text-start', id: 'text:a' },
      { type: 'text-delta', id: 'text:a', delta: 'Edited' },
      { type: 'reasoning-end', id: 'reasoning:r' },
      { type: 'text-end', id: 'text:a' },
      { type: 'finish' },
    ]);
    disconnect();
  });

  it('does not repeat submission when the acceptance response is lost', async () => {
    const { native, commands, disconnect } = runner(true);
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    const submission = native.run('Edit', 'assistant', () => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    disconnect();
    await expect(submission).rejects.toThrow('disconnected');
    expect(commands.filter((command) => command.method === 'turn/start')).toHaveLength(1);
  });
});
