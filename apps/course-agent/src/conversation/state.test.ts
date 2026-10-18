import { expect, it } from 'vitest';

import { ChatStateSchema, INITIAL_STATE, migrateChatState } from './state.js';

it('requires execution evidence for busy state and a blocking reason for blocked state', () => {
  expect(ChatStateSchema.safeParse({ ...INITIAL_STATE, status: 'waiting_for_agent' }).success).toBe(
    false,
  );
  expect(ChatStateSchema.safeParse({ ...INITIAL_STATE, status: 'blocked' }).success).toBe(false);
});
it('upgrades the prior context-only schema without guessing that interrupted work is safe to retry', () => {
  const upgraded = migrateChatState({ courseContext: null });
  expect(upgraded.migrated).toBe(true);
  expect(upgraded.state.status).toBe('blocked');
  expect(upgraded.state.execution).toBeNull();
});
it('refuses to overwrite state written by a newer implementation', () => {
  expect(() => migrateChatState({ ...INITIAL_STATE, schemaVersion: 2 })).toThrow();
});
