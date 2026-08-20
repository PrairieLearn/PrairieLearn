import { assert, describe, it } from 'vitest';

import {
  type LocalSmokeCheckpoint,
  localSmokeCheckpointKey,
  parseCheckpoint,
  serializeCheckpoint,
} from './checkpoint.js';

describe('local smoke checkpoints', () => {
  it('uses a conversation-scoped R2 key', () => {
    assert.equal(
      localSmokeCheckpointKey('conversation-1', 'run-1'),
      'conversations/conversation-1/runs/run-1/local-smoke.json',
    );
  });

  it('round-trips checkpoint content', () => {
    const checkpoint: LocalSmokeCheckpoint = {
      version: 1,
      conversationId: 'conversation-1',
      runId: 'run-1',
      command: ['/bin/bash', '-lc', 'printf sandbox-ok'],
      stdout: 'sandbox-ok',
      stderr: '',
      exitCode: 0,
      createdAt: '2026-08-20T00:00:00.000Z',
    };

    assert.deepEqual(parseCheckpoint(serializeCheckpoint(checkpoint)), checkpoint);
  });

  it('rejects malformed checkpoint content', () => {
    assert.throws(() => parseCheckpoint('{"version":2}'));
  });
});
