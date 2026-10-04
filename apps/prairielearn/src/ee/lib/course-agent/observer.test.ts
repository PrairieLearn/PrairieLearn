import { afterEach, expect, test, vi } from 'vitest';

import type { ChatSnapshot } from '@prairielearn/course-agent-contract';

import type { CourseAgentConversation } from '../../../lib/db-types.js';

import { forgetOperation, observe, stopObservers } from './observer.js';
import { createCloudflareProvider } from './provider.js';

vi.mock('@prairielearn/sentry', () => ({ captureException: vi.fn() }));
afterEach(() => {
  stopObservers();
  vi.clearAllMocks();
});

const conversation: CourseAgentConversation = {
  id: '1',
  external_id: 'test',
  course_id: '1',
  user_id: '1',
  title: 'Test',
  repository: 'example/course',
  branch: 'main',
  operation_number: 0,
  created_at: new Date(),
};

test.each(['rejected', 'archived receipt'])(
  'releases observation after a %s dispatch',
  async (completion) => {
    let changed!: () => void;
    const close = vi.fn();
    const snapshot: ChatSnapshot = { messages: [], operationNumber: 0, executions: {} };
    const getSnapshot = vi.fn().mockResolvedValue(snapshot);
    const chat = {
      ...createCloudflareProvider(new URL('http://localhost:8791'), 'test'),
      getSnapshot,
      watch: vi.fn(async (_signal: AbortSignal, callback: () => void) => {
        changed = callback;
        return close;
      }),
    };
    await observe(conversation, chat, 'operation');
    changed();
    await vi.waitFor(() => expect(getSnapshot).toHaveBeenCalledOnce());
    expect(getSnapshot).toHaveBeenLastCalledWith(expect.any(AbortSignal), ['operation']);
    expect(close).not.toHaveBeenCalled();
    if (completion === 'rejected') {
      forgetOperation(conversation.id, 'operation');
    } else {
      getSnapshot.mockResolvedValue({
        ...snapshot,
        executions: {
          operation: { status: 'completed', model: 'fixture', input: 1, cached: 0, output: 0 },
        },
      });
      changed();
    }
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  },
);

test('reconciles more than 100 registered operations in bounded receipt requests', async () => {
  let changed!: () => void;
  const close = vi.fn();
  const getSnapshot = vi.fn(async (_signal: AbortSignal, ids: string[] = []) => {
    expect(ids.length).toBeLessThanOrEqual(100);
    return {
      messages: [],
      operationNumber: 0,
      executions: Object.fromEntries(
        ids.map((id) => [
          id,
          { status: 'completed' as const, model: 'fixture', input: 1, cached: 0, output: 0 },
        ]),
      ),
    };
  });
  const chat = {
    ...createCloudflareProvider(new URL('http://localhost:8791'), 'test'),
    getSnapshot,
    watch: vi.fn(async (_signal: AbortSignal, callback: () => void) => {
      changed = callback;
      return close;
    }),
  };
  for (let index = 0; index < 101; index++) await observe(conversation, chat, String(index));
  changed();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(getSnapshot.mock.calls.map(([, ids]) => ids!.length)).toEqual([100, 1]);
  expect(chat.watch).toHaveBeenCalledOnce();
});
