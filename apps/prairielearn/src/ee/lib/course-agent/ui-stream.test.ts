import { type UIMessageChunk, readUIMessageStream } from 'ai';
import { expect, it } from 'vitest';

import type { CourseAgentEvent } from '@prairielearn/course-agent-protocol';

import { type CourseAgentMessage, courseAgentUIStream } from './ui-stream.js';

function events(items: [CourseAgentEvent['type'], Record<string, unknown>][]) {
  return items.map(([type, data], sequence) => ({
    sequence,
    type,
    data,
    occurredAt: '2026-09-03T12:00:00Z',
  }));
}

function streamOf(input: CourseAgentEvent[]) {
  return new ReadableStream<CourseAgentEvent>({
    start(controller) {
      for (const event of input) controller.enqueue(event);
      controller.close();
    },
  });
}

async function render(input: CourseAgentEvent[]) {
  const stream = streamOf(input).pipeThrough(courseAgentUIStream('current'));
  const messages = [];
  for await (const message of readUIMessageStream<CourseAgentMessage>({
    stream,
    terminateOnError: true,
  })) {
    messages.push(structuredClone(message));
  }
  return messages;
}

it('lets the SDK reconstruct text and tools from saved UI chunks', async () => {
  const chunks: UIMessageChunk[] = [
    {
      type: 'tool-input-available',
      toolCallId: 'read',
      toolName: 'activity',
      input: { label: 'Read course' },
      providerExecuted: true,
    },
    { type: 'tool-output-available', toolCallId: 'read', output: { label: 'Read course' } },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'Hé' },
    { type: 'text-delta', id: 'text', delta: 'llo' },
    { type: 'text-end', id: 'text' },
  ];
  const input = events([
    ['user.message', { runId: 'old' }],
    ['agent.completed', {}],
    ['user.message', { runId: 'current' }],
    ...chunks.map((chunk): [CourseAgentEvent['type'], Record<string, unknown>] => [
      'ui.chunk',
      { chunk },
    ]),
    ['agent.completed', {}],
  ]);
  input.splice(7, 0, input[6]);
  const messages = await render(input);
  expect(
    messages.some((message) =>
      message.parts.some((part) => part.type === 'text' && part.text === 'Hé'),
    ),
  ).toBe(true);
  expect(messages.at(-1)).toMatchObject({
    id: 'current',
    parts: [
      { type: 'tool-activity', state: 'output-available', output: { label: 'Read course' } },
      { type: 'text', text: 'Héllo', state: 'done' },
    ],
  });
});

it('emits approval notifications and only offers course refresh when the turn finishes', async () => {
  const stream = streamOf(
    events([
      ['user.message', { runId: 'current' }],
      ['git.push.approval.requested', { approvalId: 'approval' }],
      ['sync.completed', { approvalId: 'approval', commitSha: 'abc' }],
      ['agent.completed', {}],
    ]),
  ).pipeThrough(courseAgentUIStream('current'));
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(chunks).toEqual([
    expect.objectContaining({ type: 'start' }),
    { type: 'data-approvalRequested', data: { approvalId: 'approval' }, transient: true },
    {
      type: 'data-courseSynced',
      id: 'approval',
      data: { approvalId: 'approval', commitSha: 'abc', syncedAt: '2026-09-03T12:00:00Z' },
    },
    expect.objectContaining({ type: 'finish' }),
  ]);
});

it('persists run failures in SDK message metadata', async () => {
  const messages = await render(
    events([
      ['user.message', { runId: 'current' }],
      ['run.failed', { message: 'The sandbox stopped.' }],
    ]),
  );
  expect(messages.at(-1)?.metadata?.failure).toBe('The sandbox stopped.');
});

it('rejects a saved stream that ends before the run completes', async () => {
  await expect(render(events([['user.message', { runId: 'current' }]]))).rejects.toThrow(
    'before the response was complete',
  );
});
