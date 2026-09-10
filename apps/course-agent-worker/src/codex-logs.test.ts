import { describe, expect, it } from 'vitest';

import { parseCodexLine } from './codex-events.js';
import { CodexLogs } from './codex-logs.js';
import { CodexStream } from './codex-stream.js';

const notifications = [
  { method: 'item/started', params: { item: { type: 'agentMessage', id: 'answer', text: '' } } },
  { method: 'item/agentMessage/delta', params: { itemId: 'answer', delta: 'Homework ' } },
  {
    method: 'item/completed',
    params: {
      item: { type: 'agentMessage', id: 'answer', text: 'Homework 5: Boolean Conditionals' },
    },
  },
  { method: 'turn/completed', params: { turn: { status: 'completed' } } },
]
  .map((event) => JSON.stringify(event))
  .join('\n');

describe('Codex process log drain', () => {
  it.each([0, 1, 100, notifications.length - 1, notifications.length])(
    'drains every final event after polling %i characters, including an unterminated last line',
    (split) => {
      const logs = new CodexLogs();
      const stream = new CodexStream();
      for (const line of [
        ...logs.read(notifications.slice(0, split)),
        ...logs.read(notifications, true),
      ]) {
        stream.consume(parseCodexLine(line)!);
      }
      expect(stream.response).toBe('Homework 5: Boolean Conditionals');
      expect(stream.completed).toBe(true);
      expect(logs.read(notifications, true)).toEqual([]);
    },
  );

  it('handles repeated snapshots, partial lines, and a final newline without duplication', () => {
    const logs = new CodexLogs();
    expect(logs.read('one\ntw')).toEqual(['one']);
    expect(logs.read('one\ntw')).toEqual([]);
    expect(logs.read('one\ntwo\nthree\n', true)).toEqual(['two', 'three']);
  });

  it('rejects truncated snapshots instead of silently dropping output', () => {
    const logs = new CodexLogs();
    logs.read('one\ntwo\n');
    expect(() => logs.read('two\n', true)).toThrow('logs were truncated');
  });

  it('restores partial framing after the coordinator restarts', () => {
    const logs = new CodexLogs();
    expect(logs.read('one\ntw')).toEqual(['one']);
    const restored = new CodexLogs(logs.snapshot());
    expect(restored.read('one\ntwo\nthree', true)).toEqual(['two', 'three']);
    expect(restored.read('one\ntwo\nthree', true)).toEqual([]);
  });
});
