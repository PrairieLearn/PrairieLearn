import type { ColumnPinningState, SortingState, VisibilityState } from '@tanstack/table-core';
import { createParser } from 'nuqs';
import {
  type unstable_AdapterInterface,
  unstable_createAdapterProvider,
} from 'nuqs/adapters/custom';
import { NuqsAdapter as NuqsReactAdapter } from 'nuqs/adapters/react';
import React from 'preact/compat';

const AdapterContext = React.createContext('');

function useExpressAdapterContext(): unstable_AdapterInterface {
  const context = React.useContext(AdapterContext);

  return {
    searchParams: new URLSearchParams(context),
    // This will never be called on the server, so it can be a no-op.
    updateUrl: () => {},
  };
}

const NuqsExpressAdapter = unstable_createAdapterProvider(useExpressAdapterContext);

/**
 * `nuqs` needs to be aware of the current state of the URL search parameters
 * during both server-side and client-side rendering. To make this work with
 * our server-side rendering setup, we use a custom adapter that should be
 * provided with the value of `new URL(...).search` on the server side. On the
 * client, we use `NuqsReactAdapter`, which will read directly from `location.search`.
 */
export function NuqsAdapter({ children, search }: { children: React.ReactNode; search: string }) {
  if (typeof location === 'undefined') {
    // We're rendering on the server.
    return (
      <AdapterContext.Provider value={search}>
        <NuqsExpressAdapter>{children}</NuqsExpressAdapter>
      </AdapterContext.Provider>
    );
  }

  // We're rendering on the client.
  return <NuqsReactAdapter>{children}</NuqsReactAdapter>;
}

/**
 * Parses and serializes TanStack Table SortingState to/from a URL query string.
 * Used for reflecting table sort order in the URL.
 *
 * Example: `sort=col:asc` <-> `[{ id: 'col', desc: false }]`
 */
export const parseAsSortingState = createParser<SortingState>({
  parse(queryValue) {
    if (!queryValue) return [];
    return queryValue
      .split(',')
      .map((part) => {
        const [id, dir] = part.split(':');
        if (!id) return undefined;
        if (dir === 'asc' || dir === 'desc') {
          return { id, desc: dir === 'desc' };
        }
        return undefined;
      })
      .filter((v): v is { id: string; desc: boolean } => !!v);
  },
  serialize(value) {
    if (value.length === 0) return '';
    return value
      .filter((v) => v.id)
      .map((v) => `${v.id}:${v.desc ? 'desc' : 'asc'}`)
      .join(',');
  },
  eq(a, b) {
    return (
      a.length === b.length &&
      a.every((item, index) => item.id === b[index].id && item.desc === b[index].desc)
    );
  },
});

/**
 * Returns a parser for TanStack Table VisibilityState for a given set of columns.
 * Parses a comma-separated list of visible columns from a query string, e.g. 'a,b'.
 * Serializes to a comma-separated list of visible columns, omitting if all are visible.
 * Used for reflecting column visibility in the URL.
 *
 * @param allColumns - Array of all column IDs
 * @param defaultValueRef - A ref object with a `current` property that contains the default visibility state.
 */
export function parseAsColumnVisibilityStateWithColumns(
  allColumns: string[],
  defaultValueRef?: React.RefObject<VisibilityState>,
) {
  return createParser<VisibilityState>({
    parse(queryValue: string) {
      const shown =
        queryValue.length > 0
          ? new Set(queryValue.split(',').filter(Boolean))
          : new Set(allColumns);
      const result: VisibilityState = {};
      for (const col of allColumns) {
        result[col] = shown.has(col);
      }
      return result;
    },
    serialize(value) {
      // Only output columns that are visible
      const visible = Object.keys(value).filter((col) => value[col]);
      return visible.join(',');
    },
    eq(value, defaultValue) {
      const currentDefault = defaultValueRef?.current ?? defaultValue;
      const valueKeys = Object.keys(value);
      const defaultValueKeys = Object.keys(currentDefault);
      const result =
        valueKeys.length === defaultValueKeys.length &&
        valueKeys.every((col) => value[col] === currentDefault[col]);
      return result;
    },
  });
}

/**
 * Parses and serializes TanStack Table ColumnPinningState to/from a URL query string.
 * Used for reflecting pinned columns in the URL.
 *
 * Right pins aren't supported; an empty array is always returned to allow
 * this hook's value to be used directly in `state.columnPinning` in `useReactTable`.
 *
 * Example: `a,b` <-> `{ left: ['a', 'b'], right: [] }`
 */
export const parseAsColumnPinningState = createParser<ColumnPinningState>({
  parse(queryValue) {
    if (!queryValue) return { left: [], right: [] };
    // Format: col1,col2,col3 (all left-pinned columns)
    return {
      left: queryValue.split(',').filter(Boolean),
      right: [],
    };
  },
  serialize(value) {
    if (!value.left) return '';
    return value.left.join(',');
  },
  eq(a, b) {
    const aLeft = Array.isArray(a.left) ? a.left : [];
    const bLeft = Array.isArray(b.left) ? b.left : [];
    if (aLeft.length !== bLeft.length) return false;
    return aLeft.every((v, i) => v === bLeft[i]);
  },
});

/**
 * Parses and serializes numeric filter strings to/from URL-friendly format.
 * Used for numeric column filters with comparison operators.
 *
 * Internal format: `>=5`, `<=10`, `>3`, `<7`, `=5`
 * URL format: `gte_5`, `lte_10`, `gt_3`, `lt_7`, `eq_5`
 *
 * Example: `gte_5` <-> `>=5`
 */
export const parseAsNumericFilter = createParser<string>({
  parse(queryValue) {
    if (!queryValue) return '';
    // Parse format: {operator}_{value}
    const match = queryValue.match(/^(gte|lte|gt|lt|eq)_(.+)$/);
    if (!match) return '';
    const [, opCode, value] = match;
    const opMap: Record<string, string> = {
      gte: '>=',
      lte: '<=',
      gt: '>',
      lt: '<',
      eq: '=',
    };
    const operator = opMap[opCode];
    if (!operator) return '';
    return `${operator}${value}`;
  },
  serialize(value) {
    if (!value) return '';
    // Serialize format: internal (>=5) -> URL (gte_5)
    const match = value.match(/^(>=|<=|>|<|=)(.+)$/);
    if (!match) return '';
    const [, operator, val] = match;
    const opMap: Record<string, string> = {
      '>=': 'gte',
      '<=': 'lte',
      '>': 'gt',
      '<': 'lt',
      '=': 'eq',
    };
    const opCode = opMap[operator];
    if (!opCode) return '';
    return `${opCode}_${val}`;
  },
  eq(a, b) {
    return a === b;
  },
});
