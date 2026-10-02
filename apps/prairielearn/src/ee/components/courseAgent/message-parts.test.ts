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

it('uses the durable card instead of a static push-sync tool row after suspension', () => {
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
          {
            type: 'tool-push_sync',
            toolCallId: 'native-call',
            state: 'output-error',
            input: {},
            errorText: 'Codex stopped before reporting a result.',
          },
          { type: 'data-tool', data: { id: 'change', name: 'push_sync' } },
        ],
      },
    ],
    [approval],
  );
  expect(entries[0].parts).toEqual([{ kind: 'code-change', approval }]);
});

it('shows validation failures as tool errors without an approval card or duplicate native row', () => {
  const entries = buildTranscript(
    [
      {
        id: 'request',
        role: 'assistant',
        parts: [
          {
            type: 'tool-push_sync',
            toolCallId: 'native',
            state: 'output-error',
            input: {},
            errorText: 'old stream error',
          },
          { type: 'data-tool', data: { id: 'invalid', name: 'push_sync' } },
        ],
      },
      {
        id: 'result',
        role: 'assistant',
        parts: [
          {
            type: 'data-tool-display',
            data: {
              id: 'invalid',
              name: 'push_sync',
              value: { error: 'Unrecognized key: accessRules' },
            },
          },
        ],
      },
    ],
    [],
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].parts).toEqual([
    {
      kind: 'tools',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'push_sync',
          toolCallId: 'invalid',
          state: 'output-error',
          input: {},
          errorText: 'Unrecognized key: accessRules',
        },
      ],
    },
  ]);
});

it('keeps the native request visible as a tool while preparation is pending', () => {
  const entries = buildTranscript(
    [
      {
        id: 'request',
        role: 'assistant',
        parts: [
          { type: 'tool-push_sync', toolCallId: 'native', state: 'input-available', input: {} },
          { type: 'data-tool', data: { id: 'pending', name: 'push_sync' } },
        ],
      },
    ],
    [],
  );
  expect(entries[0].parts).toMatchObject([{ kind: 'tools', parts: [{ toolCallId: 'native' }] }]);
});

it('splits an assistant response around steering bubbles and omits their appended copies', () => {
  const entries = buildTranscript(
    [
      {
        id: 'assistant',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Before' },
          { type: 'data-steering', data: { id: 'first', text: 'Change the name' } },
          { type: 'text', text: 'Between' },
          { type: 'data-steering', data: { id: 'second', text: 'Remove online' } },
          { type: 'text', text: 'After' },
        ],
      },
      { id: 'first', role: 'user', parts: [{ type: 'text', text: 'Change the name' }] },
      { id: 'second', role: 'user', parts: [{ type: 'text', text: 'Remove online' }] },
    ],
    [],
  );
  expect(entries.map((entry) => entry.role)).toEqual([
    'assistant',
    'user',
    'assistant',
    'user',
    'assistant',
  ]);
  expect(entries.map((entry) => entry.parts)).toEqual(
    ['Before', 'Change the name', 'Between', 'Remove online', 'After'].map((text) => [
      { kind: 'part', part: { type: 'text', text } },
    ]),
  );
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(5);
});

it('renders steering immediately before its persisted user message arrives', () => {
  const assistant = {
    id: 'assistant',
    role: 'assistant' as const,
    parts: [
      { type: 'data-steering' as const, data: { id: 'steer', text: 'Use a different approach' } },
      { type: 'text' as const, text: 'Understood' },
    ],
  };
  const live = buildTranscript([assistant], []);
  const saved = buildTranscript(
    [
      assistant,
      { id: 'steer', role: 'user', parts: [{ type: 'text', text: 'Use a different approach' }] },
    ],
    [],
  );
  expect(live).toEqual(saved);
  expect(live[0]).toMatchObject({
    id: 'steer',
    role: 'user',
    parts: [{ kind: 'part', part: { text: 'Use a different approach' } }],
  });
});
