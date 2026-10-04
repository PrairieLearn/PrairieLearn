import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { ChatSnapshot } from '@prairielearn/course-agent-contract';
import * as Sentry from '@prairielearn/sentry';

import type { CourseAgentConversation } from '../../../lib/db-types.js';
import * as executions from '../../../models/course-agent-execution.js';

import * as events from './events.js';
import { observe, stopObservers } from './observer.js';
import { createCloudflareProvider } from './provider.js';
import * as usage from './usage.js';

// Test files share a module cache in this repository. Spies also replace the
// live bindings when a prior integration test has already imported the observer.
beforeEach(() => {
  vi.spyOn(events, 'notify');
  vi.spyOn(usage, 'recordUsage');
  vi.spyOn(executions, 'selectActiveExecution');
  vi.spyOn(Sentry, 'captureException').mockImplementation(() => 'test');
});
afterEach(() => {
  stopObservers();
  vi.restoreAllMocks();
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
  vi.mocked(events.notify).mockRejectedValue(new Error('Redis unavailable'));
  vi.mocked(usage.recordUsage).mockResolvedValue({ input: 1, output: 0, estimatedCost: 0 });
  vi.mocked(executions.selectActiveExecution).mockResolvedValue({ active: true });
  await observe(conversation, chat, vi.fn());
  changed();
  await vi.waitFor(() => expect(events.notify).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
  getSnapshot.mockResolvedValue({ messages: [], operationNumber: 0, executions: {} });
  vi.mocked(executions.selectActiveExecution).mockResolvedValue({ active: false });
  changed();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(usage.recordUsage).toHaveBeenCalledTimes(2);
});
