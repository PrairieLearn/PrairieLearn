import { expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { CourseAgentEventSchema } from '../../../lib/db-types.js';
import type { selectCourseAgentHistory } from '../../../models/course-agent.js';

import { restoreCourseAgentMessages } from './history.js';

type History = Pick<Awaited<ReturnType<typeof selectCourseAgentHistory>>, 'events' | 'messages'>;
const createdAt = new Date('2026-09-04T12:00:00Z');

it('accepts the zero-based PostgreSQL event sequence', () => {
  expect(CourseAgentEventSchema.shape.sequence.parse('0')).toBe(0);
  expect(CourseAgentEventSchema.shape.sequence.safeParse('-1').success).toBe(false);
});

function user(id: string, runId: string): History['messages'][number] {
  return {
    id,
    run_id: runId,
    conversation_id: 'conversation',
    role: 'user',
    content: `Prompt ${id}`,
    created_at: createdAt,
    authn_user_id: '1',
  };
}

function event(
  sequence: number,
  runId: string,
  type: CourseAgentEvent['type'],
  data: Record<string, unknown>,
): History['events'][number] {
  return {
    id: String(sequence + 1),
    conversation_id: 'conversation',
    run_id: runId,
    sequence,
    event_type: type,
    data,
    created_at: createdAt,
  };
}

it('restores SDK message parts from persisted chunks and omits runtime telemetry', async () => {
  const messages = await restoreCourseAgentMessages({
    messages: [user('1', 'first'), user('2', 'active')],
    events: [
      event(0, 'first', 'ui.chunk', { chunk: { type: 'text-start', id: 'text' } }),
      event(1, 'first', 'ui.chunk', {
        chunk: { type: 'text-delta', id: 'text', delta: 'First reply' },
      }),
      event(2, 'first', 'ui.chunk', { chunk: { type: 'text-end', id: 'text' } }),
      event(3, 'first', 'workspace.backup.completed', { backupId: 'private backup' }),
      event(4, 'first', 'agent.completed', { response: 'First reply' }),
      event(5, 'active', 'ui.chunk', { chunk: { type: 'text-start', id: 'active-text' } }),
    ],
  });
  expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
  expect(messages[1]).toMatchObject({
    id: 'first',
    parts: [{ type: 'text', text: 'First reply', state: 'done' }],
  });
  expect(JSON.stringify(messages)).not.toContain('private backup');
});

it('preserves failures while leaving active runs to the resumable stream', async () => {
  const messages = await restoreCourseAgentMessages({
    messages: [user('1', 'failed'), user('2', 'active')],
    events: [event(0, 'failed', 'run.failed', { message: 'Agent timed out' })],
  });
  expect(messages).toHaveLength(3);
  expect(messages[1]).toMatchObject({ metadata: { failure: 'Agent timed out' } });
});
