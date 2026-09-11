import { describe, expect, it } from 'vitest';

import { toolEvents } from './codex-events.js';

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

  it('describes each push sync outcome', () => {
    expect(
      toolEvents({
        type: 'item.started',
        item: { id: 'item-5', type: 'mcp_tool_call', tool: 'push_sync' },
      }),
    ).toEqual([
      {
        type: 'tool.started',
        data: { operationId: 'item-5', label: 'Proposing changes' },
      },
    ]);
    expect(
      toolEvents({
        type: 'item.completed',
        item: {
          id: 'item-5',
          type: 'mcp_tool_call',
          tool: 'push_sync',
          status: 'completed',
          result: { structuredContent: { ok: true } },
        },
      }),
    ).toEqual([
      {
        type: 'tool.completed',
        data: { operationId: 'item-5', label: 'Published and synced changes' },
      },
    ]);
    expect(
      toolEvents({
        type: 'item.completed',
        item: { id: 'item-6', type: 'mcp_tool_call', tool: 'push_sync', status: 'failed' },
      }),
    ).toEqual([
      {
        type: 'tool.failed',
        data: { operationId: 'item-6', label: 'Could not publish proposed changes' },
      },
    ]);
  });

  it.each([
    [{ ok: false, denied: true }, false, 'tool.completed', 'Denied request'],
    [
      { ok: false, published: true, error: 'Sync failed' },
      true,
      'tool.failed',
      'Changes published, but sync failed',
    ],
    [
      { ok: false, error: 'Invalid assessment' },
      true,
      'tool.failed',
      'Could not publish proposed changes',
    ],
    [{}, false, 'tool.completed', 'Proposed changes'],
  ])('does not confuse an MCP result with publication success', (value, isError, type, label) => {
    expect(
      toolEvents({
        type: 'item.completed',
        item: {
          id: 'push',
          type: 'mcp_tool_call',
          tool: 'push_sync',
          status: 'completed',
          result: { isError, content: [{ type: 'text', text: JSON.stringify(value) }] },
        },
      }),
    ).toEqual([{ type, data: { operationId: 'push', label } }]);
  });
});
