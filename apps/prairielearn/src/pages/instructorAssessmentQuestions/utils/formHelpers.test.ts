import { describe, expect, it } from 'vitest';

import {
  commentToString,
  parseCommentValue,
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

describe('commentToString', () => {
  it('returns undefined for null/undefined', () => {
    expect(commentToString(null)).toBeUndefined();
    expect(commentToString(undefined)).toBeUndefined();
  });

  it('returns string comments as-is', () => {
    expect(commentToString('hello')).toBe('hello');
    expect(commentToString('')).toBe('');
  });

  it('JSON-stringifies arrays', () => {
    expect(commentToString(['a', 'b'])).toBe('["a","b"]');
  });

  it('JSON-stringifies objects', () => {
    expect(commentToString({ key: 'value' })).toBe('{"key":"value"}');
  });
});

describe('parseCommentValue', () => {
  it('returns undefined for empty/null/undefined', () => {
    expect(parseCommentValue(undefined)).toBeUndefined();
    expect(parseCommentValue('')).toBeUndefined();
  });

  it('returns plain strings as-is', () => {
    expect(parseCommentValue('hello')).toBe('hello');
  });

  it('parses JSON arrays', () => {
    expect(parseCommentValue('["a","b"]')).toEqual(['a', 'b']);
  });

  it('parses JSON objects', () => {
    expect(parseCommentValue('{"key":"value"}')).toEqual({ key: 'value' });
  });

  it('returns string for invalid JSON', () => {
    expect(parseCommentValue('{bad json')).toBe('{bad json');
  });

  it('returns string for JSON primitives (number, boolean, null)', () => {
    expect(parseCommentValue('42')).toBe('42');
    expect(parseCommentValue('true')).toBe('true');
    expect(parseCommentValue('null')).toBe('null');
  });

  it('round-trips with commentToString for arrays', () => {
    const original = ['a', 'b'];
    expect(parseCommentValue(commentToString(original))).toEqual(original);
  });

  it('round-trips with commentToString for objects', () => {
    const original = { key: 'value' };
    expect(parseCommentValue(commentToString(original))).toEqual(original);
  });

  it('round-trips with commentToString for strings', () => {
    expect(parseCommentValue(commentToString('hello'))).toBe('hello');
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
