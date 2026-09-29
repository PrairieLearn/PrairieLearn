import { expect, it } from 'vitest';

import type { ApprovalDisplay } from '@prairielearn/course-agent-contract';

import { buildTranscript, isVisibleMessage } from './message-parts.js';

it('hides native recovery input but preserves ordinary user messages', () => {
  expect(
    isVisibleMessage({
      id: 'tool-call-uuid',
      role: 'user',
      metadata: { source: 'tool-result' },
      parts: [{ type: 'text', text: 'internal result' }],
    }),
  ).toBe(false);
  expect(
    isVisibleMessage({ id: 'user-uuid', role: 'user', parts: [{ type: 'text', text: 'hello' }] }),
  ).toBe(true);
});

it('interleaves text, adjacent tool groups, and durable decisions without duplicating cards', () => {
  const approval: ApprovalDisplay = {
    id: 'change',
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    digest: 'digest',
    diff: 'diff',
    status: 'approved',
  };
  const entries = buildTranscript(
    [
      {
        id: 'assistant',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Before' },
          {
            type: 'dynamic-tool',
            toolName: 'command_execution',
            toolCallId: 'one',
            state: 'input-available',
            input: {},
          },
          {
            type: 'dynamic-tool',
            toolName: 'command_execution',
            toolCallId: 'two',
            state: 'input-available',
            input: {},
          },
          { type: 'text', text: 'Between' },
          { type: 'data-tool', data: { id: 'change', name: 'push_sync' } },
          { type: 'text', text: 'After' },
        ],
      },
      {
        id: 'display',
        role: 'assistant',
        parts: [{ type: 'data-tool-display', data: { id: 'change' } }],
      },
      {
        id: 'hidden',
        role: 'user',
        metadata: { source: 'tool-result' },
        parts: [{ type: 'text', text: 'internal' }],
      },
    ],
    [approval],
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].parts.map((part) => part.kind)).toEqual([
    'part',
    'tools',
    'part',
    'code-change',
    'part',
  ]);
  expect(entries[0].parts[1]).toMatchObject({
    parts: [{ toolCallId: 'one' }, { toolCallId: 'two' }],
  });
  expect(entries[0].parts[3]).toEqual({ kind: 'code-change', approval });
});

it('keeps an actionable proposal visible when its stream marker has not arrived', () => {
  const approval: ApprovalDisplay = {
    id: 'change',
    baseSha: 'a'.repeat(40),
    proposedSha: 'b'.repeat(40),
    digest: 'digest',
    diff: 'diff',
    status: 'pending',
  };
  expect(buildTranscript([], [approval])[0].parts).toEqual([{ kind: 'code-change', approval }]);
});
