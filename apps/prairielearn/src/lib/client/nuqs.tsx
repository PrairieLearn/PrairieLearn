import type { ColumnPinningState, SortingState, VisibilityState } from '@tanstack/table-core';
import { type UseQueryStateOptions, createParser, useQueryState } from 'nuqs';
import {
  type unstable_AdapterInterface,
  unstable_createAdapterProvider,
} from 'nuqs/adapters/custom';
import { NuqsAdapter as NuqsReactAdapter } from 'nuqs/adapters/react';
import React from 'preact/compat';
import { useCallback, useEffect } from 'react';
import { useLocalStorage } from 'usehooks-ts';

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
 * Returns a parser for TanStack Table VisibilityState and column order for a given set of columns.
 * Encodes both column visibility and order in a single comma-separated list.
 * Visible columns appear in the order specified, hidden columns are appended at the end.
 *
 * Example: `a,c,b` means columns a, c, b are visible in that order, all other columns are hidden.
 * Empty string means all columns are visible in their default order.
 */
export function parseAsColumnVisibilityAndOrderState(allColumns: string[]) {
  return createParser<{
    visibility: VisibilityState;
    order: string[];
    pinning: ColumnPinningState;
  }>({
    parse(queryValue: string) {
      // Parse visible columns, stripping . prefix if present
      const entries = queryValue.length > 0 ? queryValue.split(',').filter(Boolean) : allColumns;
      const visibleColumns = entries.map((col) => col.replace(/^\./, ''));
      const pinnedColumns = entries.filter((col) => col.startsWith('.')).map((col) => col.slice(1));

      const visibility: VisibilityState = {};
      for (const col of allColumns) {
        visibility[col] = visibleColumns.includes(col);
      }

      // Order: visible columns in URL order, then hidden columns in default order
      const hiddenColumns = allColumns.filter((col) => !visibleColumns.includes(col));
      const order = [...visibleColumns, ...hiddenColumns];

      const pinning: ColumnPinningState = {
        left: pinnedColumns,
        right: [],
      };

      return { visibility, order, pinning };
    },
    serialize(value) {
      // Serialize only visible columns in their current order, with . prefix for pinned ones
      const visibleInOrder = value.order.filter((col) => value.visibility[col]);
      const pinnedSet = new Set(value.pinning.left || []);
      const serialized = visibleInOrder.map((col) => (pinnedSet.has(col) ? `.${col}` : col));

      // Omit from URL if all columns are visible in default order with no pinning
      if (
        visibleInOrder.length === allColumns.length &&
        visibleInOrder.every((col, i) => col === allColumns[i]) &&
        pinnedSet.size === 0
      ) {
        return '';
      }

      return serialized.join(',');
    },
    eq(a, b) {
      const aKeys = Object.keys(a.visibility);
      const bKeys = Object.keys(b.visibility);
      const aPinned = a.pinning.left || [];
      const bPinned = b.pinning.left || [];
      return (
        aKeys.length === bKeys.length &&
        aKeys.every((col) => a.visibility[col] === b.visibility[col]) &&
        a.order.length === b.order.length &&
        a.order.every((col, i) => col === b.order[i]) &&
        aPinned.length === bPinned.length &&
        aPinned.every((col, i) => col === bPinned[i])
      );
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

/**
 * Persist the state to both the URL and localStorage. The URL takes precedence over localStorage.
 *
 * @param scope - The scope of the query state, used to namespace the localStorage key to a specific page or component.
 * @param key - The key of the query state
 * @param options - The options for the query state
 * @returns The query state and the set state function
 *
 *
 * Implementation modified from https://github.com/47ng/nuqs/discussions/606#discussioncomment-12343199
 */
export function useQueryStateWithLocalStorage<T>(
  scope: string,
  key: string,
  options: UseQueryStateOptions<T> & {
    defaultValue: T;
  },
) {
  // queryState is never null, it defaults to the defaultValue
  const [queryState, setQueryState] = useQueryState<T>(key, options);

  // localStorageState defaults to null
  const [localStorageState, setLocalStorageState] = useLocalStorage<
    ReturnType<UseQueryStateOptions<T>['parse']>
  >(`${scope}:${key}`, queryState);

  useEffect(() => {
    // If queryState is the same as localStorageState, do nothing
    if (queryState === localStorageState) return;

    // If queryState is default (nothing there) and localStorageState is there, set localStorageState to queryState
    if (
      queryState === options.defaultValue &&
      localStorageState !== null &&
      localStorageState !== undefined
    ) {
      void setQueryState(localStorageState);
      return;
    }
  }, [queryState, localStorageState, setLocalStorageState, setQueryState, options.defaultValue]);

  type Value = NonNullable<ReturnType<typeof options.parse>>;

  const setState = useCallback(
    (value: Value | ((old: Value) => Value | null) | null) => {
      // Handle updater function form
      if (typeof value === 'function') {
        const updater = value as (old: Value) => Value | null;
        // queryState is never null because it defaults to defaultValue
        const newValue = updater(queryState as Value);
        setLocalStorageState(newValue);
        return setQueryState(newValue);
      }

      // Handle direct value form
      setLocalStorageState(value);
      return setQueryState(value);
    },
    [setLocalStorageState, setQueryState, queryState],
  );

  return [queryState, setState] as const;
}
