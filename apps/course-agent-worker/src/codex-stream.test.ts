import { describe, expect, it } from 'vitest';

import { CodexStream } from './codex-stream.js';

describe('Codex app-server notifications', () => {
  it('streams final-answer deltas immediately, without duplicating item completion', () => {
    const stream = new CodexStream();
    const item = { type: 'agentMessage', id: 'answer', phase: 'final_answer', text: '' };
    expect(stream.consume({ method: 'item/started', params: { item } })).toEqual([]);
    expect(
      stream.consume({
        method: 'item/agentMessage/delta',
        params: { itemId: 'answer', delta: 'Hello' },
      }),
    ).toEqual([{ type: 'assistant.delta', data: { text: 'Hello' } }]);
    expect(stream.response).toBe('Hello');
    expect(
      stream.consume({
        method: 'item/completed',
        params: { item: { ...item, text: 'Hello world' } },
      }),
    ).toEqual([{ type: 'assistant.delta', data: { text: ' world' } }]);
    expect(stream.response).toBe('Hello world');
  });

  it('omits commentary and reasoning', () => {
    const stream = new CodexStream();
    for (const event of [
      {
        method: 'item/started',
        params: { item: { type: 'agentMessage', id: 'comment', phase: 'commentary' } },
      },
      { method: 'item/agentMessage/delta', params: { itemId: 'comment', delta: 'I will check…' } },
      { method: 'item/reasoning/textDelta', params: { delta: 'Private reasoning' } },
    ]) {
      expect(stream.consume(event)).toEqual([]);
    }
    expect(stream.response).toBe('');
  });

  it('keeps tool lifecycle and usage in their existing public contracts', () => {
    const stream = new CodexStream();
    expect(
      stream.consume({
        method: 'item/started',
        params: {
          item: {
            type: 'commandExecution',
            id: 'tool',
            command: 'cat /workspace/README.md',
            status: 'inProgress',
          },
        },
      }),
    ).toEqual([
      { type: 'tool.started', data: { operationId: 'tool', label: 'Read /workspace/README.md' } },
    ]);
    expect(
      stream.consume({
        method: 'item/completed',
        params: {
          item: {
            type: 'fileChange',
            id: 'edit',
            changes: [{ path: 'question.html', kind: { type: 'add' } }],
            status: 'completed',
          },
        },
      }),
    ).toEqual([
      { type: 'tool.completed', data: { operationId: 'edit', label: 'Created question.html' } },
    ]);
  });
});
