import type { ColumnFiltersState, Updater } from '@tanstack/react-table';

/**
 * Creates an `onColumnFiltersChange` handler that bridges TanStack Table's
 * column filter updates to individual URL-persisted filter setters.
 *
 * This is useful when each column filter is stored as a separate URL parameter
 * via nuqs, but TanStack Table expects a single `onColumnFiltersChange` callback.
 */
export function createColumnFiltersChangeHandler(
  columnFilters: ColumnFiltersState,
  columnFilterSetters: Record<string, ((columnId: string, value: any) => void) | undefined>,
): (updaterOrValue: Updater<ColumnFiltersState>) => void {
  return (updaterOrValue: Updater<ColumnFiltersState>) => {
    const newFilters =
      typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;

    const currentFilterIds = new Set(columnFilters.map((f) => f.id));
    const newFilterIds = new Set(newFilters.map((f) => f.id));

    // Update filters that changed or were added
    for (const filter of newFilters) {
      columnFilterSetters[filter.id]?.(filter.id, filter.value);
    }

    // Clear filters that were removed
    for (const id of currentFilterIds) {
      if (!newFilterIds.has(id)) {
        columnFilterSetters[id]?.(id, []);
      }
    }
  };
}
