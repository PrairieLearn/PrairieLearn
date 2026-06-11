import type { Column } from '@tanstack/react-table';

import {
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  applyMultiSelectFilter,
} from './MultiSelectColumnFilter.js';

export type BooleanFilterOption = 'Yes' | 'No';

const BOOLEAN_FILTER_OPTIONS: readonly BooleanFilterOption[] = ['Yes', 'No'];

/**
 * A column filter for boolean-valued columns. Renders as a dropdown with
 * "Yes" and "No" options.
 *
 * The filter value is a `MultiSelectFilterValue`, so it works with the same
 * URL parsers and filter state hooks as `MultiSelectColumnFilter`. Use
 * `applyBooleanFilter` in the column's `filterFn` to apply the filter.
 *
 * @param params
 * @param params.column - The TanStack Table column object
 */
export function BooleanColumnFilter<TData>({ column }: { column: Column<TData, unknown> }) {
  return (
    <MultiSelectColumnFilter
      column={column}
      allColumnValues={BOOLEAN_FILTER_OPTIONS}
      showModeToggle={false}
    />
  );
}

/**
 * Helper for `filterFn`s of boolean columns filtered with
 * `BooleanColumnFilter`.
 */
export function applyBooleanFilter(
  filter: MultiSelectFilterValue<BooleanFilterOption> | undefined,
  value: boolean,
): boolean {
  return applyMultiSelectFilter(filter, (values) => values.includes(value ? 'Yes' : 'No'));
}
