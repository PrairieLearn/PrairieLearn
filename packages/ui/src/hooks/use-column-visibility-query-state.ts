import type { VisibilityState } from '@tanstack/table-core';
import { useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { parseAsColumnVisibilityStateWithColumns } from '../components/nuqs.js';

/**
 * Hook that provides column visibility state persisted to the URL query string.
 * Returns values ready to spread into `useReactTable`'s `state`, `initialState`,
 * and `onColumnVisibilityChange`.
 *
 * @param allColumnIds - Array of all hideable column IDs
 * @param options - Optional configuration
 * @param options.defaultHidden - Column IDs that should be hidden by default
 * @param options.paramName - URL query parameter name (defaults to `'columns'`)
 */
export function useColumnVisibilityQueryState(
  allColumnIds: string[],
  options?: { defaultHidden?: string[]; paramName?: string },
) {
  const hiddenSet = useMemo(() => new Set(options?.defaultHidden), [options?.defaultHidden]);
  const defaultColumnVisibility = useMemo<VisibilityState>(
    () => Object.fromEntries(allColumnIds.map((id) => [id, !hiddenSet.has(id)])),
    [allColumnIds, hiddenSet],
  );
  const [columnVisibility, setColumnVisibility] = useQueryState(
    options?.paramName ?? 'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  return { columnVisibility, setColumnVisibility, defaultColumnVisibility };
}
