import { describe, expect, it } from 'vitest';

import {
  getAutoScaleMax,
  getManualScaleMax,
  percentageToPoints,
  pointsToPercentage,
} from './gradingMath.js';

describe('gradingMath', () => {
  it('prefers max manual points when present', () => {
    expect(getManualScaleMax({ maxManualPoints: 6, maxPoints: 10 })).toBe(6);
  });

  it('falls back to total max points for manual scale when max manual points is zero', () => {
    expect(getManualScaleMax({ maxManualPoints: 0, maxPoints: 10 })).toBe(10);
  });

  it('prefers max auto points when present', () => {
    expect(getAutoScaleMax({ maxAutoPoints: 4, maxPoints: 10 })).toBe(4);
  });

  it('falls back to total max points for auto scale when max auto points is zero', () => {
    expect(getAutoScaleMax({ maxAutoPoints: 0, maxPoints: 10 })).toBe(10);
  });

  it('converts points to percentages', () => {
    expect(pointsToPercentage(2.345, 6)).toBe(39.08);
  });

  it('converts percentages to points', () => {
    expect(percentageToPoints(20.5, 6)).toBe(1.23);
  });

  it('returns zero percentages for zero denominators', () => {
    expect(pointsToPercentage(5, 0)).toBe(0);
  });

  it('returns zero points for zero denominators', () => {
    expect(percentageToPoints(50, 0)).toBe(0);
  });
});
