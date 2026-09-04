import { expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { CourseAgentEventSchema } from '../../../lib/db-types.js';
import type { selectCourseAgentHistory } from '../../../models/course-agent.js';

import { restoreCourseAgentMessages } from './history.js';

type History = Awaited<ReturnType<typeof selectCourseAgentHistory>>;
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

it('restores per-turn text and tool calls without exposing internal telemetry', async () => {
  const messages = await restoreCourseAgentMessages({
    backup: null,
    messages: [user('1', 'first'), user('2', 'second')],
    events: [
      event(0, 'first', 'user.message', { runId: 'first', text: 'Prompt 1' }),
      event(1, 'first', 'tool.started', {
        operationId: 'read',
        label: 'Reading README.md',
        command: 'private command',
      }),
      event(2, 'first', 'tool.completed', {
        operationId: 'read',
        label: 'Read README.md',
        stdout: 'private stdout',
      }),
      event(3, 'first', 'assistant.delta', { text: 'First reply' }),
      event(4, 'first', 'workspace.backup.completed', { backupId: 'private backup' }),
      event(5, 'first', 'agent.completed', { response: 'First reply' }),
      event(6, 'second', 'agent.completed', { response: 'Second reply' }),
    ],
  });
  expect(messages.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'user',
    'assistant',
  ]);
  expect(messages[1]).toMatchObject({
    id: 'first',
    parts: [
      { type: 'tool-activity', state: 'output-available', output: { label: 'Read README.md' } },
      { type: 'text', text: 'First reply' },
    ],
  });
  expect(messages[3].parts).toEqual([{ type: 'text', text: 'Second reply', state: 'done' }]);
  expect(JSON.stringify(messages)).not.toContain('private');
});

it('leaves active runs for SSE replay and preserves failures on completed runs', async () => {
  const messages = await restoreCourseAgentMessages({
    backup: null,
    messages: [user('1', 'failed'), user('2', 'active')],
    events: [
      event(0, 'failed', 'tool.started', { operationId: 'read', label: 'Reading a file' }),
      event(1, 'failed', 'run.failed', { message: 'Agent timed out' }),
      event(2, 'active', 'assistant.delta', { text: 'Partial response' }),
    ],
  });
  expect(messages).toHaveLength(3);
  expect(messages[1]).toMatchObject({
    metadata: { failure: 'Agent timed out' },
    parts: [{ state: 'output-error' }],
  });
  expect(messages[2].role).toBe('user');
});
