import { describe, expect, it } from 'vitest';

import { clip, toolCallFromItem } from './tool-calls.js';

describe('tool call history parts', () => {
  it('keeps the start and end of long output with a count of what was cut', () => {
    const text = `${'a'.repeat(5_000)}${'z'.repeat(5_000)}`;
    const clipped = clip(text, 4_000);
    expect(clipped.omitted).toBe(6_000);
    expect(clipped.text.startsWith('a'.repeat(1_000))).toBe(true);
    expect(clipped.text.endsWith('z'.repeat(3_000))).toBe(true);
    expect(clip('short', 4_000)).toEqual({ text: 'short', omitted: 0 });
    expect(clip('abcdef', 4, 4)).toEqual({ text: 'abcd', omitted: 2 });
  });

  it("labels commands with Codex's parsed actions and reports failure", () => {
    expect(
      toolCallFromItem('completed', {
        type: 'commandExecution',
        id: 'cmd',
        command: "/bin/bash -lc 'rg pl-number questions'",
        status: 'failed',
        commandActions: [
          {
            type: 'search',
            command: 'rg pl-number questions',
            query: 'pl-number',
            path: 'questions',
          },
        ],
        aggregatedOutput: '',
        exitCode: 1,
        durationMs: 12,
      }),
    ).toEqual({
      v: 1,
      kind: 'command',
      status: 'failed',
      durationMs: 12,
      command: "/bin/bash -lc 'rg pl-number questions'",
      actions: [{ type: 'search', query: 'pl-number', path: 'questions' }],
      exitCode: 1,
      output: null,
    });
  });

  it('turns whole-file additions into diffs and counts changed lines', () => {
    const call = toolCallFromItem('completed', {
      type: 'fileChange',
      id: 'patch',
      status: 'completed',
      changes: [
        {
          path: '/workspace/session/course/info.json',
          kind: { type: 'add' },
          diff: '{\n  "title": "Q"\n}\n',
        },
        {
          path: 'question.html',
          kind: { type: 'update', move_path: null },
          // The last line adds `++ count`, which only looks like a file header.
          diff: '--- a/question.html\n+++ b/question.html\n@@ -1 +1,3 @@\n-<p>Old</p>\n+<p>New</p>\n+<p>More</p>\n+++ count',
        },
      ],
    });
    expect(call).toMatchObject({
      kind: 'fileChange',
      changes: [
        {
          path: 'info.json',
          change: 'add',
          added: 3,
          removed: 0,
          diff: { text: '@@ -0,0 +1,3 @@\n+{\n+  "title": "Q"\n+}' },
        },
        { path: 'question.html', change: 'update', added: 3, removed: 1 },
      ],
      omittedChanges: 0,
    });
  });

  it('falls back to the item type for unfamiliar or changed items and skips messages', () => {
    expect(toolCallFromItem('started', { type: 'imageView', id: 'img', path: 'a.png' })).toEqual({
      v: 1,
      kind: 'other',
      itemType: 'imageView',
      path: 'a.png',
      status: 'running',
      durationMs: null,
    });
    // A known item whose shape changed in a later Codex release still renders, generically.
    expect(toolCallFromItem('completed', { type: 'mcpToolCall', id: 'x' })).toMatchObject({
      kind: 'other',
      itemType: 'mcpToolCall',
      status: 'completed',
    });
    expect(toolCallFromItem('completed', { type: 'agentMessage' })).toBeNull();
  });
});
