import { describe, expect, it } from 'vitest';

import { finalResponse, toolEvents } from './codex-events.js';

describe('toolEvents', () => {
  it.each([
    ['rg -n TODO /workspace/questions', 'Searched /workspace/questions'],
    ["sed -n '1,120p' questions/example/question.html", 'Read questions/example/question.html'],
    ['python3 scripts/validate.py', 'Ran validation'],
  ])('describes command execution without exposing the command', (command, label) => {
    expect(
      toolEvents({
        type: 'item.started',
        item: { id: 'item-1', type: 'command_execution', command, status: 'in_progress' },
      }),
    ).toEqual([{ type: 'tool.started', data: { operationId: 'item-1', label } }]);
  });

  it('describes a file change using its path and operation', () => {
    expect(
      toolEvents({
        type: 'item.completed',
        item: {
          id: 'item-2',
          type: 'file_change',
          status: 'completed',
          changes: [{ path: 'questions/example/server.py', kind: 'add' }],
        },
      }),
    ).toEqual([
      {
        type: 'tool.completed',
        data: { operationId: 'item-2', label: 'Created questions/example/server.py' },
      },
    ]);
  });

  it('describes a web search without storing its result', () => {
    expect(
      toolEvents({
        type: 'item.started',
        item: { id: 'item-3', type: 'web_search', query: 'PrairieLearn number input' },
      }),
    ).toEqual([
      {
        type: 'tool.started',
        data: {
          operationId: 'item-3',
          label: 'Searched the web for “PrairieLearn number input”',
        },
      },
    ]);
  });

  it('does not turn intermediate agent narration into transcript events', () => {
    expect(
      toolEvents({
        type: 'item.completed',
        item: { id: 'item-4', type: 'agent_message', text: 'I will inspect the workspace.' },
      }),
    ).toEqual([]);
  });
});

describe('finalResponse', () => {
  it('returns only the final agent message', () => {
    const stdout = [
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'I will inspect the workspace.' },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'The question is ready.' },
      }),
    ].join('\n');

    expect(finalResponse(stdout)).toBe('The question is ready.');
  });
});
