import { describe, expect, it } from 'vitest';

import {
  parsePointsListValue,
  validateAtLeastOnePointsField,
  validateNonIncreasingPoints,
  validatePointsListFormat,
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

  it('returns raw string when comma-separated input contains non-numeric values', () => {
    expect(parsePointsListValue('10, abc, 5')).toBe('10, abc, 5');
  });

  it('ignores trailing comma', () => {
    expect(parsePointsListValue('10,')).toEqual([10]);
  });

  it('ignores leading comma', () => {
    expect(parsePointsListValue(',5')).toEqual([5]);
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

describe('validatePointsListFormat', () => {
  it('returns an error for a raw string value', () => {
    expect(validatePointsListFormat('10, abc, 5')).toBe(
      'Points must be a number or a comma-separated list of numbers.',
    );
  });

  it('returns undefined for a number', () => {
    expect(validatePointsListFormat(7)).toBeUndefined();
  });

  it('returns undefined for a number array', () => {
    expect(validatePointsListFormat([10, 8, 5])).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(validatePointsListFormat(undefined)).toBeUndefined();
  });
});
