import { afterEach, expect, test, vi } from 'vitest';

import type { ChatSnapshot } from '@prairielearn/course-agent-contract';

import type { CourseAgentConversation } from '../../../lib/db-types.js';
import { selectActiveExecution } from '../../../models/course-agent-execution.js';

import { notify } from './events.js';
import { observe, stopObservers } from './observer.js';
import { createCloudflareProvider } from './provider.js';
import { recordUsage } from './usage.js';

vi.mock('./events.js', () => ({ notify: vi.fn() }));
vi.mock('./usage.js', () => ({ recordUsage: vi.fn() }));
vi.mock('../../../models/course-agent-execution.js', () => ({ selectActiveExecution: vi.fn() }));
vi.mock('@prairielearn/sentry', () => ({ captureException: vi.fn() }));
afterEach(() => {
  stopObservers();
  vi.clearAllMocks();
});

test('a Redis notification failure keeps observation attached until the execution finishes', async () => {
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
  const state: ChatSnapshot = {
    messages: [],
    operationNumber: 0,
    executions: { test: { status: 'running', model: 'fixture', input: 1, cached: 0, output: 0 } },
  };
  let changed!: () => void;
  const close = vi.fn();
  const getSnapshot = vi.fn().mockResolvedValue(state);
  const chat = {
    ...createCloudflareProvider(new URL('http://localhost:8791'), 'test'),
    getSnapshot,
    watch: vi.fn(async (_signal: AbortSignal, callback: () => void) => {
      changed = callback;
      return close;
    }),
  };
  vi.mocked(notify).mockRejectedValue(new Error('Redis unavailable'));
  vi.mocked(recordUsage).mockResolvedValue({ input: 1, output: 0, estimatedCost: 0 });
  vi.mocked(selectActiveExecution).mockResolvedValue({ active: true });
  await observe(conversation, chat);
  changed();
  await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
  getSnapshot.mockResolvedValue({ messages: [], operationNumber: 0, executions: {} });
  vi.mocked(selectActiveExecution).mockResolvedValue({ active: false });
  changed();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(recordUsage).toHaveBeenCalledTimes(2);
});
