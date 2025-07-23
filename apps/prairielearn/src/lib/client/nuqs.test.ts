import type { SortingState } from '@tanstack/table-core';
import { describe, expect, it } from 'vitest';

import {
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
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
    it('serializes empty array as empty string', () => {
      expect(parseAsSortingState.serialize([])).toBe('');
    });
    it('serializes missing id as empty string', () => {
      expect(parseAsSortingState.serialize([{ id: '', desc: false }])).toBe('');
    });
    it('serializes undefined as empty string', () => {
      expect(parseAsSortingState.serialize(undefined as any)).toBe('');
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
    it('returns true for both undefined', () => {
      expect(parseAsSortingState.eq(undefined as any, undefined as any)).toBe(true);
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

  it('serializes all columns visible as empty string', () => {
    expect(parser.serialize({ a: true, b: true, c: true })).toBe('');
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
