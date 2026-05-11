import type { ColumnPinningState, SortingState, VisibilityState } from '@tanstack/table-core';
import { createParser, parseAsArrayOf, parseAsString } from 'nuqs';
import {
  type unstable_AdapterInterface,
  unstable_createAdapterProvider,
} from 'nuqs/adapters/custom';
import { NuqsAdapter as NuqsReactAdapter } from 'nuqs/adapters/react';
import { createContext, use } from 'react';

import type { MultiSelectFilterValue } from './MultiSelectColumnFilter.js';
import type { NumericColumnFilterValue } from './NumericInputColumnFilter.js';

const AdapterContext = createContext('');

function useExpressAdapterContext(): unstable_AdapterInterface {
  const context = use(AdapterContext);

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
      <AdapterContext value={search}>
        <NuqsExpressAdapter>{children}</NuqsExpressAdapter>
      </AdapterContext>
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
  serialize(value): string {
    // `null` indicates that the value should be omitted from the URL.
    // @ts-expect-error - `null` is not assignable to type `string`.
    if (value.length === 0) return null;
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
  const parser = createParser<VisibilityState>({
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
    serialize(value): string {
      // We can't use `eq` to compare with the current default values from the
      // ref. `eq` appears to be used as part of an optimization to avoid rerenders
      // if the column set hasn't changed, so if it return `true`, we wouldn't be
      // able to update the actual visible columns after changing the defaults if
      // the new column set is equal to the default set of columns.
      //
      // Instead, we rely on the (undocumented) ability of `serialize` to return
      // `null` to indicate that the value should be omitted from the URL.
      // @ts-expect-error - `null` is not assignable to type `string`.
      if (parser.eq(value, defaultValueRef?.current ?? {})) return null;

      // Only output columns that are visible
      const visible = Object.keys(value).filter((col) => value[col]);
      return visible.join(',');
    },
    eq(value, defaultValue) {
      const valueKeys = Object.keys(value);
      const defaultValueKeys = Object.keys(defaultValue);
      const result =
        valueKeys.length === defaultValueKeys.length &&
        valueKeys.every((col) => value[col] === defaultValue[col]);
      return result;
    },
  });

  return parser;
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
 * URL format: `gte_5`, `lte_10`, `gt_3`, `lt_7`, `eq_5`, `empty`
 *
 * Example: `gte_5` <-> `>=5`
 */
export const parseAsNumericFilter = createParser<NumericColumnFilterValue>({
  parse(queryValue) {
    if (!queryValue) return { filterValue: '', emptyOnly: false };
    // Parse format: {operator}_{value}
    const match = queryValue.match(/^(gte|lte|gt|lt|eq)_(.+)$/);
    if (!match) {
      if (queryValue === 'empty') {
        return { filterValue: '', emptyOnly: true };
      }
      return { filterValue: '', emptyOnly: false };
    }
    const [, opCode, value] = match;
    const opMap: Record<string, string> = {
      gte: '>=',
      lte: '<=',
      gt: '>',
      lt: '<',
      eq: '=',
    };
    const operator = opMap[opCode];
    if (!operator) return { filterValue: '', emptyOnly: false };
    return { filterValue: `${operator}${value}`, emptyOnly: false };
  },
  serialize(value): string {
    const { filterValue, emptyOnly } = value;

    if (emptyOnly) return 'empty';

    if (filterValue.length === 0) {
      return 'empty';
    }

    // Serialize format: internal (>=5) -> URL (gte_5)
    const match = filterValue.match(/^(>=|<=|>|<|=)(.+)$/);
    // @ts-expect-error - `null` is not assignable to type `string`.
    if (!match) return null;
    const [, operator, val] = match;
    const opMap: Record<string, string> = {
      '>=': 'gte',
      '<=': 'lte',
      '>': 'gt',
      '<': 'lt',
      '=': 'eq',
    };
    const opCode = opMap[operator];
    // @ts-expect-error - `null` is not assignable to type `string`.
    if (!opCode) return null;
    return `${opCode}_${val}`;
  },
  eq(a, b) {
    return a.filterValue === b.filterValue && a.emptyOnly === b.emptyOnly;
  },
});

const EMPTY_MULTI_SELECT_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };

const itemArrayParser = parseAsArrayOf(parseAsString);

/**
 * Returns a parser for `MultiSelectFilterValue` URL state. The mode is encoded
 * as a leading `!` for exclude. Include mode has no prefix, except that a
 * leading `!` or `\` in the first value is escaped with a `\` so it isn't
 * misread as the exclude marker.
 *
 * Empty filters are serialized too (not omitted) so an explicitly cleared
 * filter is distinguishable from a missing param when the parser default is
 * non-empty. `nuqs`'s `clearOnDefault` still removes the param from the URL
 * when the value matches the default.
 *
 * The values themselves are encoded with `parseAsArrayOf(parseAsString)` so
 * commas (the value separator) inside values are escaped.
 *
 * Example URL values: `joined,invited` (include), `!joined,invited` (exclude),
 * `''` (empty include), `!` (empty exclude), `\!a,b` (include `['!a', 'b']`).
 *
 * If `allowedValues` is provided, parsed values are filtered to that set.
 */
export function parseAsMultiSelectFilter<TValue extends string = string>(
  allowedValues?: readonly TValue[],
) {
  const allowed = allowedValues ? new Set<string>(allowedValues) : null;
  return createParser<MultiSelectFilterValue<TValue>>({
    parse(queryValue) {
      if (queryValue == null) return EMPTY_MULTI_SELECT_FILTER as MultiSelectFilterValue<TValue>;
      const mode: 'include' | 'exclude' = queryValue.startsWith('!') ? 'exclude' : 'include';
      let body = mode === 'exclude' ? queryValue.slice(1) : queryValue;
      if (mode === 'include' && body.startsWith('\\')) {
        body = body.slice(1);
      }
      const tokens = (itemArrayParser.parse(body) ?? []).filter((t) => t !== '');
      const values = (allowed ? tokens.filter((v) => allowed.has(v)) : tokens) as TValue[];
      return { values, mode };
    },
    serialize(value): string {
      if (value.values.length === 0) {
        return value.mode === 'exclude' ? '!' : '';
      }
      const body = itemArrayParser.serialize(value.values);
      if (value.mode === 'exclude') return `!${body}`;
      return body.startsWith('!') || body.startsWith('\\') ? `\\${body}` : body;
    },
    eq(a, b) {
      if (a.mode !== b.mode) return false;
      if (a.values.length !== b.values.length) return false;
      return a.values.every((v, i) => v === b.values[i]);
    },
  });
}
