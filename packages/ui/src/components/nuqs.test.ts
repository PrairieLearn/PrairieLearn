import type { SortingState } from '@tanstack/table-core';
import { describe, expect, it } from 'vitest';

import {
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsNumericFilter,
  parseAsSortingState,
} from './nuqs.js';

describe('parseAsSortingState', () => {
  describe('parse', () => {
    it('parses valid asc', () => {
      expect(parseAsSortingState.parse('col:asc')).toEqual([{ id: 'col', desc: false }]);
    });
    it('parses valid desc', () => {
      expect(parseAsSortingState.parse('col:desc')).toEqual([{ id: 'col', desc: true }]);
    });
    it('parses multiple columns', () => {
      expect(parseAsSortingState.parse('col1:asc,col2:desc')).toEqual([
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ]);
    });
    it('ignores invalid columns in multi-column', () => {
      expect(parseAsSortingState.parse('col1:asc,invalid,foo:bar,col2:desc')).toEqual([
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ]);
    });
    it('returns [] for empty string', () => {
      expect(parseAsSortingState.parse('')).toEqual([]);
    });
    it('returns [] for missing id', () => {
      expect(parseAsSortingState.parse(':asc')).toEqual([]);
    });
    it('returns [] for invalid direction', () => {
      expect(parseAsSortingState.parse('col:foo')).toEqual([]);
    });
    it('returns [] for undefined', () => {
      expect(parseAsSortingState.parse(undefined as any)).toEqual([]);
    });
  });

  describe('serialize', () => {
    it('serializes asc', () => {
      const state: SortingState = [{ id: 'col', desc: false }];
      expect(parseAsSortingState.serialize(state)).toBe('col:asc');
    });
    it('serializes desc', () => {
      const state: SortingState = [{ id: 'col', desc: true }];
      expect(parseAsSortingState.serialize(state)).toBe('col:desc');
    });
    it('serializes multiple columns', () => {
      const state: SortingState = [
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ];
      expect(parseAsSortingState.serialize(state)).toBe('col1:asc,col2:desc');
    });
    it('serializes empty array as null', () => {
      expect(parseAsSortingState.serialize([])).toBe(null);
    });
    it('serializes missing id as empty string', () => {
      expect(parseAsSortingState.serialize([{ id: '', desc: false }])).toBe('');
    });
  });

  describe('eq', () => {
    it('returns true for equal states', () => {
      const a: SortingState = [{ id: 'col', desc: false }];
      const b: SortingState = [{ id: 'col', desc: false }];
      expect(parseAsSortingState.eq(a, b)).toBe(true);
    });
    it('returns true for equal multi-column states', () => {
      const a: SortingState = [
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ];
      const b: SortingState = [
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ];
      expect(parseAsSortingState.eq(a, b)).toBe(true);
    });
    // The order of the sort columns matters for multi-column sorting.
    it('returns false for different order in multi-column', () => {
      const a: SortingState = [
        { id: 'col1', desc: false },
        { id: 'col2', desc: true },
      ];
      const b: SortingState = [
        { id: 'col2', desc: true },
        { id: 'col1', desc: false },
      ];
      expect(parseAsSortingState.eq(a, b)).toBe(false);
    });
    it('returns false for different ids', () => {
      const a: SortingState = [{ id: 'col1', desc: false }];
      const b: SortingState = [{ id: 'col2', desc: false }];
      expect(parseAsSortingState.eq(a, b)).toBe(false);
    });
    it('returns false for different desc', () => {
      const a: SortingState = [{ id: 'col', desc: false }];
      const b: SortingState = [{ id: 'col', desc: true }];
      expect(parseAsSortingState.eq(a, b)).toBe(false);
    });
    it('returns true for both empty', () => {
      expect(parseAsSortingState.eq([], [])).toBe(true);
    });
    it('returns false for one empty, one not', () => {
      expect(parseAsSortingState.eq([], [{ id: 'col', desc: false }])).toBe(false);
    });
  });
});

describe('parseAsColumnVisibilityStateWithColumns', () => {
  const allColumns = ['a', 'b', 'c'];
  const parser = parseAsColumnVisibilityStateWithColumns(allColumns);

  it('parses empty string as all columns visible', () => {
    expect(parser.parse('')).toEqual({ a: true, b: true, c: true });
  });

  it('parses comma-separated columns as only those visible', () => {
    expect(parser.parse('a,b')).toEqual({ a: true, b: true, c: false });
    expect(parser.parse('b')).toEqual({ a: false, b: true, c: false });
  });

  it('serializes partial visibility as comma-separated columns', () => {
    expect(parser.serialize({ a: true, b: false, c: true })).toBe('a,c');
    expect(parser.serialize({ a: false, b: true, c: false })).toBe('b');
  });

  it('eq returns true for equal visibility', () => {
    expect(parser.eq({ a: true, b: false, c: true }, { a: true, b: false, c: true })).toBe(true);
  });

  it('eq returns false for different visibility', () => {
    expect(parser.eq({ a: true, b: false, c: true }, { a: false, b: false, c: true })).toBe(false);
  });
});

describe('parseAsColumnPinningState', () => {
  const parser = parseAsColumnPinningState;

  it('parses empty string as no pinned columns', () => {
    expect(parser.parse('')).toEqual({ left: [], right: [] });
  });

  it('parses comma-separated columns as left-pinned', () => {
    expect(parser.parse('a,b')).toEqual({ left: ['a', 'b'], right: [] });
    expect(parser.parse('c')).toEqual({ left: ['c'], right: [] });
  });

  it('serializes left-pinned columns as comma-separated string', () => {
    expect(parser.serialize({ left: ['a', 'b'], right: [] })).toBe('a,b');
    expect(parser.serialize({ left: [], right: [] })).toBe('');
  });

  it('eq returns true for equal pinning', () => {
    expect(parser.eq({ left: ['a', 'b'], right: [] }, { left: ['a', 'b'], right: [] })).toBe(true);
  });

  it('eq returns false for different pinning', () => {
    expect(parser.eq({ left: ['a', 'b'], right: [] }, { left: ['b', 'a'], right: [] })).toBe(false);
    expect(parser.eq({ left: ['a'], right: [] }, { left: ['a', 'b'], right: [] })).toBe(false);
  });
});

describe('parseAsNumericFilter', () => {
  describe('parse', () => {
    it('parses gte format', () => {
      expect(parseAsNumericFilter.parse('gte_5')).toEqual({ filterValue: '>=5', emptyOnly: false });
    });
    it('parses lte format', () => {
      expect(parseAsNumericFilter.parse('lte_10')).toEqual({
        filterValue: '<=10',
        emptyOnly: false,
      });
    });
    it('parses gt format', () => {
      expect(parseAsNumericFilter.parse('gt_3')).toEqual({ filterValue: '>3', emptyOnly: false });
    });
    it('parses lt format', () => {
      expect(parseAsNumericFilter.parse('lt_7')).toEqual({ filterValue: '<7', emptyOnly: false });
    });
    it('parses eq format', () => {
      expect(parseAsNumericFilter.parse('eq_5')).toEqual({ filterValue: '=5', emptyOnly: false });
    });
    it('parses empty keyword', () => {
      expect(parseAsNumericFilter.parse('empty')).toEqual({ filterValue: '', emptyOnly: true });
    });
    it('returns default for invalid format', () => {
      expect(parseAsNumericFilter.parse('invalid')).toEqual({ filterValue: '', emptyOnly: false });
    });
    it('returns default for empty string', () => {
      expect(parseAsNumericFilter.parse('')).toEqual({ filterValue: '', emptyOnly: false });
    });
    it('returns default for undefined', () => {
      expect(parseAsNumericFilter.parse(undefined as any)).toEqual({
        filterValue: '',
        emptyOnly: false,
      });
    });
    it('parses decimal values', () => {
      expect(parseAsNumericFilter.parse('gte_3.14')).toEqual({
        filterValue: '>=3.14',
        emptyOnly: false,
      });
    });
    it('parses negative values', () => {
      expect(parseAsNumericFilter.parse('lt_-5')).toEqual({ filterValue: '<-5', emptyOnly: false });
    });
  });

  describe('serialize', () => {
    it('serializes >= format', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '>=5', emptyOnly: false })).toBe(
        'gte_5',
      );
    });
    it('serializes <= format', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '<=10', emptyOnly: false })).toBe(
        'lte_10',
      );
    });
    it('serializes > format', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '>3', emptyOnly: false })).toBe('gt_3');
    });
    it('serializes < format', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '<7', emptyOnly: false })).toBe('lt_7');
    });
    it('serializes = format', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '=5', emptyOnly: false })).toBe('eq_5');
    });
    it('serializes emptyOnly as empty', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '', emptyOnly: true })).toBe('empty');
    });
    it('serializes empty filterValue as empty', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: '', emptyOnly: false })).toBe('empty');
    });
    it('returns null for invalid filterValue', () => {
      expect(parseAsNumericFilter.serialize({ filterValue: 'invalid', emptyOnly: false })).toBe(
        null,
      );
    });
  });

  describe('eq', () => {
    it('returns true for equal values', () => {
      expect(
        parseAsNumericFilter.eq(
          { filterValue: '>=5', emptyOnly: false },
          { filterValue: '>=5', emptyOnly: false },
        ),
      ).toBe(true);
    });
    it('returns false for different filterValue', () => {
      expect(
        parseAsNumericFilter.eq(
          { filterValue: '>=5', emptyOnly: false },
          { filterValue: '>=10', emptyOnly: false },
        ),
      ).toBe(false);
    });
    it('returns false for different emptyOnly', () => {
      expect(
        parseAsNumericFilter.eq(
          { filterValue: '', emptyOnly: true },
          { filterValue: '', emptyOnly: false },
        ),
      ).toBe(false);
    });
  });
});

describe('parseAsMultiSelectFilter', () => {
  const parser = parseAsMultiSelectFilter();
  const restricted = parseAsMultiSelectFilter(['a', 'b', 'c'] as const);

  describe('parse', () => {
    it('parses unprefixed values as include', () => {
      expect(parser.parse('a,b')).toEqual({ values: ['a', 'b'], mode: 'include' });
    });
    it('parses leading "!" as exclude', () => {
      expect(parser.parse('!a,b')).toEqual({ values: ['a', 'b'], mode: 'exclude' });
    });
    it('returns empty include for empty string', () => {
      expect(parser.parse('')).toEqual({ values: [], mode: 'include' });
    });
    it('returns empty exclude for "!" alone', () => {
      expect(parser.parse('!')).toEqual({ values: [], mode: 'exclude' });
    });
    it('drops empty tokens from leading, trailing, and double commas', () => {
      expect(parser.parse(',a,,b,')).toEqual({ values: ['a', 'b'], mode: 'include' });
    });
    it('drops disallowed values when allowedValues is provided', () => {
      expect(restricted.parse('a,x,b,y')).toEqual({ values: ['a', 'b'], mode: 'include' });
    });
    it('drops disallowed values in exclude mode', () => {
      expect(restricted.parse('!a,x,c')).toEqual({ values: ['a', 'c'], mode: 'exclude' });
    });
    it('preserves mode when all values are filtered out', () => {
      expect(restricted.parse('!x,y')).toEqual({ values: [], mode: 'exclude' });
    });
    it('preserves order of allowed values as they appeared in the URL', () => {
      expect(restricted.parse('c,a,b')).toEqual({ values: ['c', 'a', 'b'], mode: 'include' });
    });
    it('decodes commas inside values', () => {
      expect(parser.parse('a%2Cb,c')).toEqual({ values: ['a,b', 'c'], mode: 'include' });
    });
    it('decodes commas inside values in exclude mode', () => {
      expect(parser.parse('!a%2Cb,c')).toEqual({ values: ['a,b', 'c'], mode: 'exclude' });
    });
    it('unescapes a leading "\\!" in include mode as a literal "!"', () => {
      expect(parser.parse('\\!a,b')).toEqual({ values: ['!a', 'b'], mode: 'include' });
    });
    it('unescapes a leading "\\\\" in include mode as a literal "\\"', () => {
      expect(parser.parse('\\\\a,b')).toEqual({ values: ['\\a', 'b'], mode: 'include' });
    });
  });

  describe('serialize', () => {
    it('serializes include without prefix', () => {
      expect(parser.serialize({ values: ['a', 'b'], mode: 'include' })).toBe('a,b');
    });
    it('serializes exclude with leading "!"', () => {
      expect(parser.serialize({ values: ['a', 'b'], mode: 'exclude' })).toBe('!a,b');
    });
    it('serializes empty include as empty string so the param is preserved in the URL', () => {
      expect(parser.serialize({ values: [], mode: 'include' })).toBe('');
    });
    it('serializes empty exclude as "!"', () => {
      expect(parser.serialize({ values: [], mode: 'exclude' })).toBe('!');
    });
    it('escapes commas inside values', () => {
      expect(parser.serialize({ values: ['a,b', 'c'], mode: 'include' })).toBe('a%2Cb,c');
    });
    it('escapes a leading "!" in include mode so it is not parsed as exclude', () => {
      expect(parser.serialize({ values: ['!a', 'b'], mode: 'include' })).toBe('\\!a,b');
    });
    it('escapes a leading "\\" in include mode so it is not parsed as an escape', () => {
      expect(parser.serialize({ values: ['\\a', 'b'], mode: 'include' })).toBe('\\\\a,b');
    });
    it('does not escape an inner "!"', () => {
      expect(parser.serialize({ values: ['a', '!b'], mode: 'include' })).toBe('a,!b');
    });
  });

  describe('round-trip', () => {
    it.each([
      ['a'],
      ['a,b'],
      ['!a'],
      ['!a,b,c'],
      [''],
      ['!'],
      ['a%2Cb,c'],
      ['\\!a,b'],
      ['\\\\a,b'],
      ['!!a'],
    ])('parse(serialize(parse(%s))) is stable', (raw) => {
      const parsed = parser.parse(raw)!;
      const serialized = parser.serialize(parsed)!;
      expect(serialized).toBe(raw);
      expect(parser.parse(serialized)).toEqual(parsed);
    });
  });

  describe('eq', () => {
    it('returns true for matching values and mode', () => {
      expect(
        parser.eq({ values: ['a', 'b'], mode: 'include' }, { values: ['a', 'b'], mode: 'include' }),
      ).toBe(true);
    });
    it('returns true for two empty includes', () => {
      expect(parser.eq({ values: [], mode: 'include' }, { values: [], mode: 'include' })).toBe(
        true,
      );
    });
    it('returns false for different mode', () => {
      expect(
        parser.eq({ values: ['a'], mode: 'include' }, { values: ['a'], mode: 'exclude' }),
      ).toBe(false);
    });
    it('returns false for different values', () => {
      expect(
        parser.eq({ values: ['a'], mode: 'include' }, { values: ['b'], mode: 'include' }),
      ).toBe(false);
    });
    it('returns false for different lengths', () => {
      expect(
        parser.eq({ values: ['a'], mode: 'include' }, { values: ['a', 'b'], mode: 'include' }),
      ).toBe(false);
    });
    // Order matters because UI selection order is preserved through the URL.
    it('returns false for same values in different order', () => {
      expect(
        parser.eq({ values: ['a', 'b'], mode: 'include' }, { values: ['b', 'a'], mode: 'include' }),
      ).toBe(false);
    });
  });
});
