import { describe, expect, it } from 'vitest';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

import { CodexAppServerClient } from './codex.js';
import type { CourseSandbox } from './sandbox.js';

const turn = { id: 'turn', status: 'inProgress', error: null };

function runner(savedReview?: ReviewOutcome) {
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
    },
  });
  const sandbox = {
    fetch: async () => ({ status: 101, webSocket: socket }),
  } as unknown as DurableObjectStub<CourseSandbox>;
  const native = new CodexAppServerClient(sandbox);
  native.beginTurn('assistant');
  return {
    native,
    commands,
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
