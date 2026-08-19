import type { RowSelectionState, Table } from '@tanstack/react-table';
import { useEffect } from 'react';

export function pruneRowSelection(
  selection: RowSelectionState,
  validRowIds: Set<string>,
): RowSelectionState {
  const retainedEntries = Object.entries(selection).filter(([id]) => validRowIds.has(id));
  return retainedEntries.length === Object.keys(selection).length
    ? selection
    : Object.fromEntries(retainedEntries);
}

/**
 * Removes selected row IDs that are no longer present in the table's core data.
 * This is opt-in because tables with server-side pagination may intentionally retain off-page selections.
 */
export function usePruneRowSelection<TData>(table: Table<TData>) {
  const data = table.options.data;

  useEffect(() => {
    const validRowIds = new Set(table.getCoreRowModel().flatRows.map((row) => row.id));

    // TanStack Table retains selected row IDs after data changes, so synchronize selection with the core rows.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    table.setRowSelection((selection) => pruneRowSelection(selection, validRowIds));
  }, [data, table]);
}
