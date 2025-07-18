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
    if (!value || value.length === 0) return '';
    return value
      .filter((v) => v.id)
      .map((v) => `${v.id}:${v.desc ? 'desc' : 'asc'}`)
      .join(',');
  },
  eq(a, b) {
    if (!a || !b) return a === b;
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
 */
export function parseAsColumnVisibilityStateWithColumns(allColumns: string[]) {
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
      if (!value) return '';
      // Only output columns that are visible
      const visible = allColumns.filter((col) => value[col]);
      if (visible.length === allColumns.length) return '';
      return visible.join(',');
    },
    eq(a, b) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      return aKeys.length === bKeys.length && aKeys.every((col) => a[col] === b[col]);
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
    if (!value || !value.left) return '';
    return value.left.join(',');
  },
  eq(a, b) {
    const aLeft = Array.isArray(a.left) ? a.left : [];
    const bLeft = Array.isArray(b.left) ? b.left : [];
    if (aLeft.length !== bLeft.length) return false;
    return aLeft.every((v, i) => v === bLeft[i]);
  },
});
