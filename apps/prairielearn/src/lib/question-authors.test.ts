import { assert, describe, it } from 'vitest';

import { QuestionAuthorUidsSchema } from './question-authors.js';

describe('question authors', () => {
  it('accepts 100 authors and rejects 101', () => {
    const authors = Array.from({ length: 100 }, (_, i) => `author-${i}`);
    assert.lengthOf(QuestionAuthorUidsSchema.parse(authors), 100);
    assert.isFalse(QuestionAuthorUidsSchema.safeParse([...authors, 'one-too-many']).success);
  });

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
