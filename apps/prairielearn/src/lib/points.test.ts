import { describe, expect, it } from 'vitest';

import { roundPoints } from './points.js';

describe('roundPoints', () => {
  it('handles an integer', () => {
    expect(roundPoints(5)).toBe(5);
  });

  it('handles a number with many decimal places', () => {
    expect(roundPoints(0.3125)).toBe(0.3125);
  });

  it('truncates long decimal places', () => {
    expect(roundPoints(0.31256789)).toBe(0.312568);
  });

  it('rounds to nearest integer', () => {
    expect(roundPoints(3 + 0.4 + 0.3 + 0.3)).toBe(4);
  });

  it('avoids trailing zeroes', () => {
    expect(roundPoints(0.1 + 0.2)).toBe(0.3);
  });
});
