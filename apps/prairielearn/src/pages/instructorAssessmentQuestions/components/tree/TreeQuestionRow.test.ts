import { describe, expect, it } from 'vitest';

import { compactPoints } from './TreeQuestionRow.js';

describe('compactPoints', () => {
  it('returns empty string for empty array', () => {
    expect(compactPoints([])).toBe('');
  });

  it('returns single value for single-element array', () => {
    expect(compactPoints([10])).toBe('10');
  });

  it('joins distinct values with commas', () => {
    expect(compactPoints([10, 5, 3])).toBe('10, 5, 3');
  });

  it('does not collapse runs of 2', () => {
    expect(compactPoints([10, 10])).toBe('10, 10');
  });

  it('collapses runs of 3 or more', () => {
    expect(compactPoints([10, 10, 10])).toBe('10×3');
  });

  it('collapses mixed runs', () => {
    expect(compactPoints([10, 10, 10, 5, 5])).toBe('10×3, 5, 5');
  });

  it('handles multiple collapsed runs', () => {
    expect(compactPoints([10, 10, 10, 5, 5, 5])).toBe('10×3, 5×3');
  });

  it('handles alternating values', () => {
    expect(compactPoints([10, 5, 10, 5])).toBe('10, 5, 10, 5');
  });
});
