import { assert, describe, it } from 'vitest';

import { QuestionAuthorsSchema, getOrcidUrl } from './question-authors.js';

describe('question authors', () => {
  it('validates nonblank UIDs and deduplicates without treating UIDs as emails', () => {
    const longUid = 'a'.repeat(256);
    assert.deepEqual(QuestionAuthorsSchema.parse([' UID ', 'UID', 'uid', longUid]), [
      'UID',
      'uid',
      longUid,
    ]);
    for (const uid of ['', ' \t\n']) {
      assert.isFalse(QuestionAuthorsSchema.safeParse([uid]).success);
    }
  });

  it('canonicalizes and deduplicates ORCID URLs without merging them with UIDs', () => {
    assert.deepEqual(
      QuestionAuthorsSchema.parse([
        'author-uid',
        ' HTTP://ORCID.ORG/0000-0002-1694-233x/ ',
        'https://orcid.org/0000-0002-1694-233X',
      ]),
      ['author-uid', 'https://orcid.org/0000-0002-1694-233X'],
    );
    for (const invalid of [
      'https://orcid.org/0000-0002-1825-0098',
      'https://orcid.org/0000-0002-1825-0097?redirect=elsewhere',
    ]) {
      assert.isNull(getOrcidUrl(invalid));
      assert.isFalse(QuestionAuthorsSchema.safeParse([invalid]).success);
    }
    assert.isNull(getOrcidUrl('https://orcid.org.example.com/0000-0002-1825-0097'));
  });
});
