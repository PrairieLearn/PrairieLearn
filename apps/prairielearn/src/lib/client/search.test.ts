import { describe, expect, it } from 'vitest';

import { normalizeQid, rankSearchText } from './search.js';

describe('normalizeQid', () => {
  it('splits camelCase and PascalCase words', () => {
    expect(normalizeQid('additionalNames')).toBe('additional names');
    expect(normalizeQid('HTTPResponseCode')).toBe('http response code');
  });

  it('normalizes separators to spaces', () => {
    expect(normalizeQid('additional-names/more_names')).toBe('additional names more names');
  });
});

describe('rankSearchText', () => {
  it('matches spaced queries against camelCase text', () => {
    expect(rankSearchText('additionalNames', 'additional names').passed).toBe(true);
  });

  it('matches separator queries against camelCase text', () => {
    expect(rankSearchText('additionalNames', 'additional-names').passed).toBe(true);
    expect(rankSearchText('additionalNames', 'additional_names').passed).toBe(true);
  });
});
