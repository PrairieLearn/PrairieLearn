import { describe, expect, it } from 'vitest';

import { rankSearchText } from './search.js';

describe('rankSearchText', () => {
  it('matches spaced queries against camelCase text', () => {
    expect(rankSearchText('additionalNames', 'additional names').passed).toBe(true);
    expect(rankSearchText('HTTPResponseCode', 'http response code').passed).toBe(true);
  });

  it('matches separator queries against camelCase text', () => {
    expect(rankSearchText('additionalNames', 'additional-names').passed).toBe(true);
    expect(rankSearchText('additionalNames', 'additional_names').passed).toBe(true);
    expect(
      rankSearchText('additional-names/more_names', 'additional names more names').passed,
    ).toBe(true);
  });

  it('matches spaced queries against qids with numbers', () => {
    expect(rankSearchText('internalGrade/addingNumbers2', 'Numbers2').passed).toBe(true);
    expect(rankSearchText('internalGrade/addingNumbers2', 'Numbers 2').passed).toBe(true);
  });

  it('does not match unrelated long titles after normalizing the query', () => {
    expect(
      rankSearchText('Internal Grading: Adding two numbers (with manual points)', 'additionalNames')
        .passed,
    ).toBe(false);
  });

  it('does not match loose character sequences for multi-word qid searches', () => {
    expect(rankSearchText('externalGrade/alpine', 'adding num').passed).toBe(false);
    expect(rankSearchText('prairieDrawFigure', 'adding num').passed).toBe(false);
    expect(rankSearchText('internalGrade/addingNumbers2', 'adding num').passed).toBe(true);
  });
});
