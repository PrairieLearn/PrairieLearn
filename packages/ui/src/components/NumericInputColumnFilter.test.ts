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
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '=5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '4', emptyOnly: false }),
    ).toBe(false);
  });

  it('should filter with less than operator', () => {
    expect(
      numericColumnFilterFn(createMockRow(3), 'col', { filterValue: '<5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '<5', emptyOnly: false }),
    ).toBe(false);
    expect(
      numericColumnFilterFn(createMockRow(7), 'col', { filterValue: '<5', emptyOnly: false }),
    ).toBe(false);
  });

  it('should filter with greater than operator', () => {
    expect(
      numericColumnFilterFn(createMockRow(7), 'col', { filterValue: '>5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '>5', emptyOnly: false }),
    ).toBe(false);
    expect(
      numericColumnFilterFn(createMockRow(3), 'col', { filterValue: '>5', emptyOnly: false }),
    ).toBe(false);
  });

  it('should filter with less than or equal operator', () => {
    expect(
      numericColumnFilterFn(createMockRow(3), 'col', { filterValue: '<=5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '<=5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(7), 'col', { filterValue: '<=5', emptyOnly: false }),
    ).toBe(false);
  });

  it('should filter with greater than or equal operator', () => {
    expect(
      numericColumnFilterFn(createMockRow(7), 'col', { filterValue: '>=5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '>=5', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(3), 'col', { filterValue: '>=5', emptyOnly: false }),
    ).toBe(false);
  });

  it('should return true for invalid or empty filter', () => {
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '', emptyOnly: false }),
    ).toBe(true);
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: 'invalid', emptyOnly: false }),
    ).toBe(true);
  });

  it('should return false for null values when filter is active', () => {
    expect(
      numericColumnFilterFn(createMockRow(null), 'col', { filterValue: '>5', emptyOnly: false }),
    ).toBe(false);
  });

  it('should return true for null values when filter is empty', () => {
    expect(
      numericColumnFilterFn(createMockRow(null), 'col', { filterValue: '', emptyOnly: false }),
    ).toBe(true);
  });
  it('should return true for null values when emptyOnly is true', () => {
    expect(
      numericColumnFilterFn(createMockRow(null), 'col', { filterValue: '', emptyOnly: true }),
    ).toBe(true);
  });
  it('should return false for set values when emptyOnly is true', () => {
    expect(
      numericColumnFilterFn(createMockRow(5), 'col', { filterValue: '', emptyOnly: true }),
    ).toBe(false);
  });
});
