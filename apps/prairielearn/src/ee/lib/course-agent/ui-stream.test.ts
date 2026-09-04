import { readUIMessageStream } from 'ai';
import { describe, expect, it } from 'vitest';

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

async function render(input: CourseAgentEvent[]) {
  const stream = new ReadableStream<CourseAgentEvent>({
    start(controller) {
      for (const event of input) controller.enqueue(event);
      controller.close();
    },
  }).pipeThrough(courseAgentUIStream('current'));
  const messages: CourseAgentMessage[] = [];
  for await (const message of readUIMessageStream<CourseAgentMessage>({
    stream,
    terminateOnError: true,
  })) {
    messages.push(structuredClone(message));
  }
  return messages;
}

describe('course-agent UI-message adapter', () => {
  it('streams text and inline tool updates without replaying earlier turns or duplicate events', async () => {
    const input = events([
      ['user.message', { runId: 'old', text: 'Earlier' }],
      ['assistant.delta', { text: 'Old answer' }],
      ['agent.completed', { response: 'Old answer' }],
      ['user.message', { runId: 'current', text: 'Hello' }],
      ['sandbox.starting', { restoring: true }],
      ['sandbox.ready', {}],
      ['tool.started', { operationId: 'read', label: 'Reading README.md' }],
      ['tool.completed', { operationId: 'read', label: 'Read README.md' }],
      ['assistant.delta', { text: 'Hé' }],
      ['assistant.delta', { text: 'llo' }],
      ['assistant.delta', { text: 'Héllo!', replace: true }],
      ['agent.completed', { response: 'Héllo!' }],
    ]);
    input.splice(10, 0, input[9]);
    const messages = await render(input);
    expect(
      messages.some((message) =>
        message.parts.some((part) => part.type === 'text' && part.text === 'Hé'),
      ),
    ).toBe(true);
    expect(messages.at(-1)).toMatchObject({
      id: 'current',
      role: 'assistant',
      parts: [
        { type: 'tool-activity', state: 'output-available', output: { label: 'Restored agent' } },
        { type: 'tool-activity', state: 'output-available', output: { label: 'Read README.md' } },
        { type: 'text', text: 'Héllo!', state: 'done' },
      ],
    });
    expect(JSON.stringify(messages)).not.toContain('Old answer');
  });

  it('does not invent tools or startup phases for a text-only turn', async () => {
    const messages = await render(
      events([
        ['user.message', { runId: 'current' }],
        ['sandbox.ready', {}],
        ['agent.completed', { response: 'Hello.' }],
      ]),
    );
    expect(messages.at(-1)?.parts).toEqual([{ type: 'text', text: 'Hello.', state: 'done' }]);
  });

  it('marks interrupted operations as failed and preserves the run failure', async () => {
    const messages = await render(
      events([
        ['user.message', { runId: 'current' }],
        ['tool.started', { operationId: 'read', label: 'Reading a file' }],
        ['run.failed', { message: 'Agent timed out' }],
      ]),
    );
    expect(messages.at(-1)).toMatchObject({
      metadata: { failure: 'Agent timed out' },
      parts: [{ type: 'tool-activity', state: 'output-error' }],
    });
  });

  it('rejects a truncated run so the client can reconnect', async () => {
    await expect(
      render(
        events([
          ['user.message', { runId: 'current' }],
          ['assistant.delta', { text: 'Partial' }],
        ]),
      ),
    ).rejects.toThrow('before the response was complete');
  });

  it('rejects a non-append replacement instead of corrupting the answer', async () => {
    await expect(
      render(
        events([
          ['user.message', { runId: 'current' }],
          ['assistant.delta', { text: 'Hello' }],
          ['assistant.delta', { text: 'Different answer', replace: true }],
        ]),
      ),
    ).rejects.toThrow('replaced an already streamed response');
  });
});
