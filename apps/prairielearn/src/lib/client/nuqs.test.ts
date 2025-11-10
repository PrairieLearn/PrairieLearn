import type { SortingState } from '@tanstack/table-core';
import { describe, expect, it } from 'vitest';

import {
  parseAsColumnPinningState,
  parseAsColumnVisibilityAndOrderState,
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

describe('parseAsColumnVisibilityAndOrderState', () => {
  const allColumns = ['a', 'b', 'c'];
  const parser = parseAsColumnVisibilityAndOrderState(allColumns);

  describe('parse', () => {
    it('parses empty string as all columns visible in default order with no pinning', () => {
      expect(parser.parse('')).toEqual({
        visibility: { a: true, b: true, c: true },
        order: ['a', 'b', 'c'],
        pinning: { left: [], right: [] },
      });
    });

    it('parses comma-separated columns as only those visible in that order', () => {
      expect(parser.parse('a,b')).toEqual({
        visibility: { a: true, b: true, c: false },
        order: ['a', 'b', 'c'], // visible first, then hidden in default order
        pinning: { left: [], right: [] },
      });
      expect(parser.parse('b')).toEqual({
        visibility: { a: false, b: true, c: false },
        order: ['b', 'a', 'c'],
        pinning: { left: [], right: [] },
      });
    });

    it('parses reordered columns', () => {
      expect(parser.parse('c,a,b')).toEqual({
        visibility: { a: true, b: true, c: true },
        order: ['c', 'a', 'b'],
        pinning: { left: [], right: [] },
      });
    });

    it('parses reordered with hidden columns', () => {
      expect(parser.parse('c,a')).toEqual({
        visibility: { a: true, b: false, c: true },
        order: ['c', 'a', 'b'], // visible in order, then hidden in default order
        pinning: { left: [], right: [] },
      });
    });

    it('parses pinned columns with . prefix', () => {
      expect(parser.parse('.a,.b,c')).toEqual({
        visibility: { a: true, b: true, c: true },
        order: ['a', 'b', 'c'],
        pinning: { left: ['a', 'b'], right: [] },
      });
    });

    it('parses mixed pinned and unpinned columns', () => {
      expect(parser.parse('.a,c,b')).toEqual({
        visibility: { a: true, b: true, c: true },
        order: ['a', 'c', 'b'],
        pinning: { left: ['a'], right: [] },
      });
    });

    it('parses pinned columns with hidden columns', () => {
      expect(parser.parse('.a,c')).toEqual({
        visibility: { a: true, b: false, c: true },
        order: ['a', 'c', 'b'],
        pinning: { left: ['a'], right: [] },
      });
    });
  });

  describe('serialize', () => {
    it('serializes all columns visible in default order as empty string', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['a', 'b', 'c'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('');
    });

    it('serializes partial visibility as comma-separated visible columns in order', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: false, c: true },
          order: ['a', 'c', 'b'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('a,c');
      expect(
        parser.serialize({
          visibility: { a: false, b: true, c: false },
          order: ['b', 'a', 'c'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('b');
    });

    it('serializes reordered visible columns', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['c', 'a', 'b'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('c,a,b');
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['b', 'c', 'a'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('b,c,a');
    });

    it('serializes reordered with hidden columns', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: false, c: true },
          order: ['c', 'a', 'b'],
          pinning: { left: [], right: [] },
        }),
      ).toBe('c,a');
    });

    it('serializes pinned columns with . prefix', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['a', 'b', 'c'],
          pinning: { left: ['a', 'b'], right: [] },
        }),
      ).toBe('.a,.b,c');
    });

    it('serializes mixed pinned and unpinned columns', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['a', 'c', 'b'],
          pinning: { left: ['a'], right: [] },
        }),
      ).toBe('.a,c,b');
    });

    it('serializes pinned columns with hidden columns', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: false, c: true },
          order: ['a', 'c', 'b'],
          pinning: { left: ['a'], right: [] },
        }),
      ).toBe('.a,c');
    });

    it('serializes all columns pinned', () => {
      expect(
        parser.serialize({
          visibility: { a: true, b: true, c: true },
          order: ['a', 'b', 'c'],
          pinning: { left: ['a', 'b', 'c'], right: [] },
        }),
      ).toBe('.a,.b,.c');
    });
  });

  describe('eq', () => {
    it('returns true for equal visibility, order, and pinning', () => {
      expect(
        parser.eq(
          {
            visibility: { a: true, b: false, c: true },
            order: ['a', 'c', 'b'],
            pinning: { left: ['a'], right: [] },
          },
          {
            visibility: { a: true, b: false, c: true },
            order: ['a', 'c', 'b'],
            pinning: { left: ['a'], right: [] },
          },
        ),
      ).toBe(true);
    });

    it('returns false for different visibility', () => {
      expect(
        parser.eq(
          {
            visibility: { a: true, b: false, c: true },
            order: ['a', 'c', 'b'],
            pinning: { left: [], right: [] },
          },
          {
            visibility: { a: false, b: false, c: true },
            order: ['a', 'c', 'b'],
            pinning: { left: [], right: [] },
          },
        ),
      ).toBe(false);
    });

    it('returns false for different order', () => {
      expect(
        parser.eq(
          {
            visibility: { a: true, b: true, c: true },
            order: ['a', 'b', 'c'],
            pinning: { left: [], right: [] },
          },
          {
            visibility: { a: true, b: true, c: true },
            order: ['c', 'b', 'a'],
            pinning: { left: [], right: [] },
          },
        ),
      ).toBe(false);
    });

    it('returns false for different pinning', () => {
      expect(
        parser.eq(
          {
            visibility: { a: true, b: true, c: true },
            order: ['a', 'b', 'c'],
            pinning: { left: ['a'], right: [] },
          },
          {
            visibility: { a: true, b: true, c: true },
            order: ['a', 'b', 'c'],
            pinning: { left: ['a', 'b'], right: [] },
          },
        ),
      ).toBe(false);
    });
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
