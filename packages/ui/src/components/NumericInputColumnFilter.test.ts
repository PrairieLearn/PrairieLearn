import { describe, expect, it } from 'vitest';

import { numericColumnFilterFn, parseNumericFilter } from './NumericInputColumnFilter.js';

describe('parseNumericFilter', () => {
  it('should parse equals operator', () => {
    expect(parseNumericFilter('5')).toEqual({ operator: '=', value: 5 });
    expect(parseNumericFilter('=5')).toEqual({ operator: '=', value: 5 });
    expect(parseNumericFilter('= 5')).toEqual({ operator: '=', value: 5 });
  });

  it('should parse less than operator', () => {
    expect(parseNumericFilter('<5')).toEqual({ operator: '<', value: 5 });
    expect(parseNumericFilter('< 5')).toEqual({ operator: '<', value: 5 });
  });

  it('should parse greater than operator', () => {
    expect(parseNumericFilter('>5')).toEqual({ operator: '>', value: 5 });
    expect(parseNumericFilter('> 5')).toEqual({ operator: '>', value: 5 });
  });

  it('should parse less than or equal operator', () => {
    expect(parseNumericFilter('<=5')).toEqual({ operator: '<=', value: 5 });
    expect(parseNumericFilter('<= 5')).toEqual({ operator: '<=', value: 5 });
  });

  it('should parse greater than or equal operator', () => {
    expect(parseNumericFilter('>=5')).toEqual({ operator: '>=', value: 5 });
    expect(parseNumericFilter('>= 5')).toEqual({ operator: '>=', value: 5 });
  });

  it('should handle decimals', () => {
    expect(parseNumericFilter('5.5')).toEqual({ operator: '=', value: 5.5 });
    expect(parseNumericFilter('>3.14')).toEqual({ operator: '>', value: 3.14 });
  });

  it('should handle negative numbers', () => {
    expect(parseNumericFilter('-5')).toEqual({ operator: '=', value: -5 });
    expect(parseNumericFilter('<-3')).toEqual({ operator: '<', value: -3 });
  });

  it('should return null for invalid input', () => {
    expect(parseNumericFilter('')).toBeNull();
    expect(parseNumericFilter('   ')).toBeNull();
    expect(parseNumericFilter('abc')).toBeNull();
    expect(parseNumericFilter('>>')).toBeNull();
    expect(parseNumericFilter('5.5.5')).toBeNull();
  });

  it('should handle whitespace', () => {
    expect(parseNumericFilter('  >  5  ')).toEqual({ operator: '>', value: 5 });
  });
});

describe('numericColumnFilterFn', () => {
  const createMockRow = (value: number | null) => ({
    getValue: () => value,
  });

  it('should filter with equals operator', () => {
    expect(numericColumnFilterFn(createMockRow(5), 'col', '5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '=5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '4')).toBe(false);
  });

  it('should filter with less than operator', () => {
    expect(numericColumnFilterFn(createMockRow(3), 'col', '<5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '<5')).toBe(false);
    expect(numericColumnFilterFn(createMockRow(7), 'col', '<5')).toBe(false);
  });

  it('should filter with greater than operator', () => {
    expect(numericColumnFilterFn(createMockRow(7), 'col', '>5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '>5')).toBe(false);
    expect(numericColumnFilterFn(createMockRow(3), 'col', '>5')).toBe(false);
  });

  it('should filter with less than or equal operator', () => {
    expect(numericColumnFilterFn(createMockRow(3), 'col', '<=5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '<=5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(7), 'col', '<=5')).toBe(false);
  });

  it('should filter with greater than or equal operator', () => {
    expect(numericColumnFilterFn(createMockRow(7), 'col', '>=5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', '>=5')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(3), 'col', '>=5')).toBe(false);
  });

  it('should return true for invalid or empty filter', () => {
    expect(numericColumnFilterFn(createMockRow(5), 'col', '')).toBe(true);
    expect(numericColumnFilterFn(createMockRow(5), 'col', 'invalid')).toBe(true);
  });

  it('should return false for null values when filter is active', () => {
    expect(numericColumnFilterFn(createMockRow(null), 'col', '>5')).toBe(false);
  });

  it('should return true for null values when filter is empty', () => {
    expect(numericColumnFilterFn(createMockRow(null), 'col', '')).toBe(true);
  });
});
