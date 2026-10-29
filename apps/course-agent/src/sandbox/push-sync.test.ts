import type { UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

const turn = { id: 'turn', status: 'inProgress', error: null };

function runner({
  savedReview,
  onReview,
  threadResult = { thread: { id: 'thread' } },
}: {
  threadResult?: unknown;
  savedReview?: ReviewOutcome;
  onReview?: Parameters<CodexAppServerClient['beginTurn']>[1];
} = {}) {
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
      if (frame.method === 'initialize') {
        emit({
          id: frame.id,
          result: {},
        });
      }
      if (frame.method === 'thread/start' || frame.method === 'thread/resume') {
        emit({ id: frame.id, result: threadResult });
      }
      if (frame.method === 'thread/read') {
        const previousTurn = {
          ...turn,
          status: 'completed',
          items: savedReview
            ? [
                {
                  type: 'functionCallOutput',
                  id: 'review-output',
                  name: 'push_sync',
                  namespace: null,
                  output: JSON.stringify(savedReview),
                },
              ]
            : [],
        };
        emit({
          id: frame.id,
          result: { thread: { id: 'thread', turns: [previousTurn] } },
        });
      }
      if (frame.method === 'turn/start') {
        emit({ id: frame.id, result: { turn } });
      }
      if (frame.method === 'turn/interrupt') emit({ id: frame.id, result: {} });
    },
  });
  const sandbox = {
    fetch: async () => ({ status: 101, webSocket: socket }),
  } as unknown as DurableObjectStub<CourseSandbox>;
  const native = new CodexAppServerClient(sandbox);
  const stream = native.beginTurn('assistant', onReview);
  return {
    sandbox,
    native,
    stream,
    commands,
    emit,
    disconnect: () => socket.close(),
  };
}

describe('Codex native stream', () => {
  it('ends the SDK response for review and continues on the retained native connection', async () => {
    const review = Promise.withResolvers<ReviewOutcome['result']>();
    const { native, stream, emit, disconnect } = runner({
      onReview: (_call, ready) => {
        ready();
        return review.promise;
      },
    });
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: null });
    await native.run('Edit', () => {});
    const collect = async (stream: ReadableStream<UIMessageChunk>) => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return chunks;
    };
    const firstResponse = collect(stream);
    emit({
      id: 'review',
      method: 'item/tool/call',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        callId: 'review',
        tool: 'push_sync',
        namespace: null,
        arguments: {},
      },
    });
    expect(await firstResponse).toContainEqual({
      type: 'tool-input-available',
      toolCallId: 'review',
      toolName: 'push_sync',
      input: {},
    });

    const nextResponse = collect(native.openStream('assistant'));
    review.resolve({
      decision: 'denied',
      publication: { status: 'not_attempted' },
      sync: { status: 'not_attempted' },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread',
        turnId: 'turn',
        itemId: 'reply',
        delta: 'Continuing after review',
      },
    });
    emit({
      method: 'item/completed',
      params: { threadId: 'thread', item: { type: 'agentMessage', id: 'reply' } },
    });
    emit({
      method: 'turn/completed',
      params: { threadId: 'thread', turn: { ...turn, status: 'completed' } },
    });
    await native.finished;
    native.closeStream();
    expect(await nextResponse).toEqual([
      { type: 'start', messageId: 'assistant' },
      { type: 'text-start', id: 'text:reply' },
      { type: 'text-delta', id: 'text:reply', delta: 'Continuing after review' },
      { type: 'text-end', id: 'text:reply' },
      { type: 'finish' },
    ]);
    disconnect();
  });

  it.each([
    {
      name: 'restored review supplies only its result without replaying the prompt',
      incorporated: false,
    },
    { name: 'already-incorporated review does not start another native turn', incorporated: true },
  ])('$name', async ({ incorporated }) => {
    const outcome: ReviewOutcome = {
      callId: 'pending-review',
      result: {
        decision: 'denied',
        publication: { status: 'not_attempted' },
        sync: { status: 'not_attempted' },
      },
    };
    const { native, commands, disconnect } = runner({
      savedReview: incorporated ? outcome : undefined,
    });
    await native.connect();
    await native.thread({ model: 'test', instructions: 'Edit course', threadId: 'thread' });
    await native.run(outcome, () => {});
    const submissions = commands.filter((command) => command.method === 'turn/start');
    expect(submissions.map((command) => command.params)).toEqual(
      incorporated
        ? []
        : [
            {
              threadId: 'thread',
              input: [],
              toolOutput: {
                name: 'push_sync',
                namespace: null,
                output: JSON.stringify(outcome),
                retain: true,
              },
            },
          ],
    );
    native.closeStream();
    disconnect();
  });
});
