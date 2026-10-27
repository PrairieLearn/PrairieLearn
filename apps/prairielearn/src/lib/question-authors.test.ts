import { assert, describe, it } from 'vitest';

import { QuestionAuthorUidsSchema, normalizeQuestionAuthors } from './question-authors.js';

describe('question authors', () => {
  it('converts legacy emails without requiring an email address or account, preserving UID case', () => {
    assert.deepEqual(
      normalizeQuestionAuthors([
        'Author',
        { name: 'Old name', email: 'Author' },
        { email: 'another-uid' },
      ]),
      {
        uids: ['Author', 'another-uid'],
        warnings: [],
      },
    );
  });

  it('identifies each legacy entry that cannot be converted without inventing a UID', () => {
    const authors = [
      { name: 'Name only' },
      { orcid: '0000-0000-0000-0001' },
      { originCourse: 'COURSE 101' },
      { email: '   ' },
    ];
    const result = normalizeQuestionAuthors(authors);
    assert.isEmpty(result.uids);
    assert.deepEqual(
      result.warnings,
      authors.map(
        (author) =>
          `Legacy author ${JSON.stringify(author)} cannot be converted to a UID because it has no usable email. Replace this entry with the author's UID in info.json.`,
      ),
    );
  });

  it('validates bounded nonblank UIDs and deduplicates without treating UIDs as emails', () => {
    assert.deepEqual(QuestionAuthorUidsSchema.parse([' UID ', 'UID', 'uid']), ['UID', 'uid']);
    for (const uid of ['', ' \t\n', 'a'.repeat(256)]) {
      assert.isFalse(QuestionAuthorUidsSchema.safeParse([uid]).success);
    }
    assert.lengthOf(
      QuestionAuthorUidsSchema.parse(Array.from({ length: 11 }, (_, i) => `uid${i}`)),
      11,
    );
  });
});
