import { assert, describe, it } from 'vitest';

import { QuestionAuthorUidsSchema } from './question-authors.js';

describe('question authors', () => {
  it('validates nonblank UIDs and deduplicates without treating UIDs as emails', () => {
    const longUid = 'a'.repeat(256);
    assert.deepEqual(QuestionAuthorUidsSchema.parse([' UID ', 'UID', 'uid', longUid]), [
      'UID',
      'uid',
      longUid,
    ]);
    for (const uid of ['', ' \t\n']) {
      assert.isFalse(QuestionAuthorUidsSchema.safeParse([uid]).success);
    }
  });
});
