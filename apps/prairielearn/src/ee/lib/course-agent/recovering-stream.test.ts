import { expect, it, vi } from 'vitest';

import {
  type CourseAgentEvent,
  CourseAgentSnapshotSchema,
} from '@prairielearn/course-agent-protocol';

import { recoveringCourseAgentStream } from './recovering-stream.js';

it('replays durable events after disconnect without duplicating output or ending approval waits', async () => {
  const runId = '6a157d3d-9974-41b9-940b-6d1adbd62f46';
  const event = (
    sequence: number,
    type: CourseAgentEvent['type'],
    data = {},
  ): CourseAgentEvent => ({ sequence, type, data, occurredAt: '2026-01-01T00:00:00.000Z' });
  const first = [
    event(0, 'user.message', { runId }),
    event(1, 'assistant.delta', { text: 'Hello' }),
  ];
  const second = [
    ...first,
    event(2, 'assistant.delta', { text: ' world' }),
    event(3, 'agent.completed', { response: 'Hello world' }),
  ];
  const source = (events: CourseAgentEvent[]) =>
    new ReadableStream<CourseAgentEvent>({
      start(controller) {
        events.forEach((value) => controller.enqueue(value));
        controller.close();
      },
    });
  const snapshot = CourseAgentSnapshotSchema.parse({
    conversationId: runId,
    sandboxId: 'sandbox',
    activeRunId: runId,
    status: 'offline',
    conversationState: 'waiting_for_approval',
    response: null,
    error: null,
    events: first,
  });
  const connect = vi
    .fn()
    .mockResolvedValueOnce(source(first))
    .mockResolvedValueOnce(source(second));
  const inspect = vi
    .fn()
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce({ ...snapshot, activeRunId: null, events: second });
  const reader = recoveringCourseAgentStream({
    runId,
    connect,
    snapshot: inspect,
    retryDelayMs: 0,
  }).getReader();
  const received = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    received.push(next.value);
  }
  expect(received).toEqual(second);
  expect(connect).toHaveBeenCalledTimes(2);
});
