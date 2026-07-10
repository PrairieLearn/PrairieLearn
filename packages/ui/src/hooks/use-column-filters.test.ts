import type { ColumnFiltersState } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

import { type ColumnFilterEntry, buildColumnFiltersResult } from './use-column-filters.js';

interface MultiSelect {
  values: string[];
  mode: 'include' | 'exclude';
}

const EMPTY: MultiSelect = { values: [], mode: 'include' };
const STICKY: MultiSelect = { values: ['joined'], mode: 'include' };

const multiSelectEq = (a: MultiSelect, b: MultiSelect): boolean =>
  a.mode === b.mode &&
  a.values.length === b.values.length &&
  a.values.every((value, index) => value === b.values[index]);

// The parser identity isn't exercised by buildColumnFiltersResult beyond `eq`;
// a typed stub with eq wired up is enough.
const stubParser = {
  withDefault: () => stubParser,
  eq: multiSelectEq,
} as unknown as ColumnFilterEntry<MultiSelect>['parser'];

function makeRegistry() {
  return {
    enrollment_status: { urlKey: 'status', parser: stubParser, defaultValue: STICKY },
    role: { urlKey: 'role', parser: stubParser, defaultValue: EMPTY },
    hidden: {
      urlKey: 'hidden',
      parser: stubParser,
      defaultValue: EMPTY,
      enabled: false,
    },
  } satisfies Record<string, ColumnFilterEntry<MultiSelect>>;
}

describe('buildColumnFiltersResult', () => {
  it('emits columnFilters with current values for enabled filters only', () => {
    const result = buildColumnFiltersResult(
      makeRegistry(),
      {
        enrollment_status: { values: ['invited'], mode: 'include' },
        role: EMPTY,
        hidden: { values: ['x'], mode: 'include' },
      },
      vi.fn(),
    );

    expect(result.columnFilters).toEqual([
      { id: 'enrollment_status', value: { values: ['invited'], mode: 'include' } },
      { id: 'role', value: EMPTY },
    ]);
  });

  it('hides onResetColumnFilters when every enabled filter is at its default', () => {
    const inactive = buildColumnFiltersResult(
      makeRegistry(),
      { enrollment_status: STICKY, role: EMPTY, hidden: { values: ['x'], mode: 'include' } },
      vi.fn(),
    );
    expect(inactive.onResetColumnFilters).toBeUndefined();
    expect(inactive.activeColumnFilterIds).toEqual([]);

    const active = buildColumnFiltersResult(
      makeRegistry(),
      {
        enrollment_status: { values: ['invited'], mode: 'include' },
        role: EMPTY,
        hidden: EMPTY,
      },
      vi.fn(),
    );
    expect(active.onResetColumnFilters).toBeTypeOf('function');
    expect(active.activeColumnFilterIds).toEqual(['enrollment_status']);
  });

  it('onResetColumnFilters patches every enabled filter to null', () => {
    const applyPatch = vi.fn();
    const result = buildColumnFiltersResult(
      makeRegistry(),
      {
        enrollment_status: { values: ['invited'], mode: 'include' },
        role: { values: ['staff'], mode: 'include' },
        hidden: EMPTY,
      },
      applyPatch,
    );

    result.onResetColumnFilters?.();

    expect(applyPatch).toHaveBeenCalledExactlyOnceWith({
      enrollment_status: null,
      role: null,
    });
    expect(applyPatch.mock.calls[0][0]).not.toHaveProperty('hidden');
  });

  it('onColumnFiltersChange patches present filters and resets absent ones to null', () => {
    const applyPatch = vi.fn();
    const result = buildColumnFiltersResult(
      makeRegistry(),
      { enrollment_status: STICKY, role: EMPTY, hidden: EMPTY },
      applyPatch,
    );

    const next: ColumnFiltersState = [
      { id: 'enrollment_status', value: { values: ['invited'], mode: 'include' } },
    ];
    result.onColumnFiltersChange(next);

    expect(applyPatch).toHaveBeenCalledExactlyOnceWith({
      enrollment_status: { values: ['invited'], mode: 'include' },
      role: null,
    });
  });

  it('onColumnFiltersChange supports functional updaters that receive current state', () => {
    const applyPatch = vi.fn();
    const result = buildColumnFiltersResult(
      makeRegistry(),
      {
        enrollment_status: STICKY,
        role: { values: ['student'], mode: 'include' },
        hidden: EMPTY,
      },
      applyPatch,
    );

    result.onColumnFiltersChange((current) =>
      current.map((filter) =>
        filter.id === 'role'
          ? { ...filter, value: { values: ['staff'], mode: 'include' } }
          : filter,
      ),
    );

    expect(applyPatch).toHaveBeenCalledExactlyOnceWith({
      enrollment_status: STICKY,
      role: { values: ['staff'], mode: 'include' },
    });
  });

  it('onColumnFiltersChange never patches disabled filters', () => {
    const applyPatch = vi.fn();
    const result = buildColumnFiltersResult(
      makeRegistry(),
      { enrollment_status: STICKY, role: EMPTY, hidden: { values: ['x'], mode: 'include' } },
      applyPatch,
    );

    result.onColumnFiltersChange([]);

    expect(applyPatch).toHaveBeenCalledExactlyOnceWith({
      enrollment_status: null,
      role: null,
    });
    expect(applyPatch.mock.calls[0][0]).not.toHaveProperty('hidden');
  });
});
