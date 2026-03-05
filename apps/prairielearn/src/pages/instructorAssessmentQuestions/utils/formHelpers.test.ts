import { describe, expect, it } from 'vitest';

import {
  parsePointsListValue,
  resolvePointsProperty,
  validateAtLeastOnePointsField,
  validateNonIncreasingPoints,
} from './formHelpers.js';

describe('parsePointsListValue', () => {
  it('returns undefined for empty string', () => {
    expect(parsePointsListValue('')).toBeUndefined();
  });

  it('returns a number for a single numeric string', () => {
    expect(parsePointsListValue('5')).toBe(5);
  });

  it('returns a number for zero', () => {
    expect(parsePointsListValue('0')).toBe(0);
  });

  it('returns an array of numbers for comma-separated values', () => {
    expect(parsePointsListValue('10, 8, 5')).toEqual([10, 8, 5]);
  });

  it('returns the string as-is for non-numeric input without commas', () => {
    expect(parsePointsListValue('abc')).toBe('abc');
  });

  it('filters NaN values from comma-separated input', () => {
    expect(parsePointsListValue('10, abc, 5')).toEqual([10, 5]);
  });
});

describe('validateAtLeastOnePointsField', () => {
  it('returns an error when no values are set', () => {
    expect(validateAtLeastOnePointsField({})).toBe(
      'At least one of auto points or manual points must be set.',
    );
  });

  it('returns undefined when own points is set', () => {
    expect(validateAtLeastOnePointsField({ points: 5 })).toBeUndefined();
  });

  it('returns undefined when own autoPoints is set', () => {
    expect(validateAtLeastOnePointsField({ autoPoints: 10 })).toBeUndefined();
  });

  it('returns undefined when own manualPoints is set', () => {
    expect(validateAtLeastOnePointsField({ manualPoints: 3 })).toBeUndefined();
  });

  it('returns undefined when parent values satisfy the requirement', () => {
    expect(validateAtLeastOnePointsField({}, { autoPoints: 10 })).toBeUndefined();
  });

  it('returns an error when neither own nor parent values are set', () => {
    expect(validateAtLeastOnePointsField({}, {})).toBe(
      'At least one of auto points or manual points must be set.',
    );
  });
});

describe('validateNonIncreasingPoints', () => {
  it('returns undefined for a non-increasing array', () => {
    expect(validateNonIncreasingPoints([10, 8, 5, 5, 2])).toBeUndefined();
  });

  it('returns an error for an increasing sequence', () => {
    expect(validateNonIncreasingPoints([5, 10])).toBe(
      'Points must be non-increasing (each value must be ≤ the previous).',
    );
  });

  it('returns an error for negative values', () => {
    expect(validateNonIncreasingPoints([10, -1])).toBe('All point values must be non-negative.');
  });

  it('returns undefined for a single number', () => {
    expect(validateNonIncreasingPoints(7)).toBeUndefined();
  });

  it('returns undefined for a string', () => {
    expect(validateNonIncreasingPoints('abc')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(validateNonIncreasingPoints(undefined)).toBeUndefined();
  });
});

describe('resolvePointsProperty', () => {
  it('returns autoPoints when autoPoints is set in the first source', () => {
    expect(resolvePointsProperty({ autoPoints: 10 })).toBe('autoPoints');
  });

  it('returns points when points is set and autoPoints is not', () => {
    expect(resolvePointsProperty({ points: 5 })).toBe('points');
  });

  it('prefers autoPoints over points in the same source', () => {
    expect(resolvePointsProperty({ autoPoints: 10, points: 5 })).toBe('autoPoints');
  });

  it('falls back to later sources', () => {
    expect(resolvePointsProperty({}, { points: 5 })).toBe('points');
  });

  it('defaults to autoPoints when no sources have values', () => {
    expect(resolvePointsProperty({}, undefined)).toBe('autoPoints');
  });

  it('defaults to autoPoints with no arguments', () => {
    expect(resolvePointsProperty()).toBe('autoPoints');
  });
});
