import { describe, expect, it, vi } from 'vitest';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

const turn = { id: 'turn', status: 'inProgress', error: null };

function runner(
  savedReview?: ReviewOutcome,
  onReview?: Parameters<CodexAppServerClient['beginTurn']>[1],
) {
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
        emit({ id: frame.id, result: { thread: { id: 'thread' } } });
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
                  name: 'request_changes',
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
    },
  });
  const sandbox = {
    fetch: async () => ({ status: 101, webSocket: socket }),
  } as unknown as DurableObjectStub<CourseSandbox>;
  const native = new CodexAppServerClient(sandbox);
  native.beginTurn('assistant', onReview);
  return {
    native,
    commands,
    emit,
    disconnect: () => socket.close(),
  };
}

describe('Codex native stream', () => {
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
    const { native, commands, disconnect } = runner(incorporated ? outcome : undefined);
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
                name: 'request_changes',
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

it('returns native tool success after an approved local save and sync', async () => {
  const { native, commands, emit, disconnect } = runner(undefined, async (_call, ready) => {
    ready();
    return {
      decision: 'approved',
      publication: { status: 'saved_locally' },
      sync: { status: 'succeeded' },
    };
  });
  await native.connect();
  await native.thread({ model: 'test', instructions: 'Edit course', threadId: 'thread' });
  const running = native.run('Edit the course', () => {});
  await vi.waitFor(() =>
    expect(commands).toContainEqual(expect.objectContaining({ method: 'turn/start' })),
  );
  emit({
    id: 100,
    method: 'item/tool/call',
    params: {
      callId: 'review',
      threadId: 'thread',
      turnId: 'turn',
      namespace: null,
      tool: 'request_changes',
      arguments: {},
    },
  });
  await vi.waitFor(() =>
    expect(commands).toContainEqual(
      expect.objectContaining({ id: 100, result: expect.objectContaining({ success: true }) }),
    ),
  );
  emit({
    method: 'turn/completed',
    params: { threadId: 'thread', turn: { ...turn, status: 'completed' } },
  });
  await running;
  disconnect();
});
