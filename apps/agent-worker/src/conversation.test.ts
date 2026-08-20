import { assert, describe, it } from 'vitest';

import { parseConversationId, parseRunId } from './conversation.js';

describe('parseConversationId', () => {
  it('accepts identifiers safe for Durable Object names and R2 keys', () => {
    assert.equal(parseConversationId('course_123-conversation'), 'course_123-conversation');
  });

  it.each(['', '../other', 'contains spaces', 'a'.repeat(81), 42, undefined])(
    'rejects %j',
    (value) => {
      assert.throws(() => parseConversationId(value));
    },
  );
});

describe('parseRunId', () => {
  it('accepts UUIDs', () => {
    assert.equal(
      parseRunId('3f690f14-66cd-4c30-8092-c300add0b427'),
      '3f690f14-66cd-4c30-8092-c300add0b427',
    );
  });
});
