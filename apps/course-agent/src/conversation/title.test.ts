import { describe, expect, it } from 'vitest';

import { MAX_TITLE_LENGTH, normalizeTitle } from './title.js';

describe('normalizeTitle', () => {
  it('strips quotes and trailing punctuation after trimming', () => {
    expect(normalizeTitle('"Fix derivative typo."\n')).toBe('Fix derivative typo');
    expect(normalizeTitle('“Revisar addNumbers”')).toBe('Revisar addNumbers');
  });

  it('keeps an apostrophe that does not wrap the title', () => {
    expect(normalizeTitle("Review students' answers")).toBe("Review students' answers");
  });

  it('caps long titles by code point without splitting surrogate pairs', () => {
    const title = normalizeTitle(`${'a'.repeat(MAX_TITLE_LENGTH - 4)}📚📚📚📚📚`);
    expect(title).toBe(`${'a'.repeat(MAX_TITLE_LENGTH - 4)}📚...`);
    expect([...title]).toHaveLength(MAX_TITLE_LENGTH);
  });
});
