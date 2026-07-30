import type { Row, Table } from '@tanstack/react-table';
import { type MouseEvent, useCallback, useState } from 'react';

/**
 * A hook that provides shift-click range selection functionality for table checkboxes.
 * Use this hook in the parent component and pass the returned props to individual checkboxes.
 *
 * @example
 * ```tsx
 * const { lastClickedRowId, createCheckboxProps } = useShiftClickCheckbox();
 *
 * // In your column definition:
 * cell: ({ row, table }) => {
 *   return <input type="checkbox" {...createCheckboxProps(row, table)} />;
 * }
 * ```
 */
export function useShiftClickCheckbox<TData>() {
  const [lastClickedRowId, setLastClickedRowId] = useState<string | null>(null);

  /**
   * Creates props for a checkbox that supports shift-click range selection.
   * @param row - The TanStack Table row
   * @param table - The TanStack Table instance
   * @returns Props to spread on the checkbox input element
   */
  const createCheckboxProps = useCallback(
    (row: Row<TData>, table: Table<TData>) => {
      const handleClick = (e: MouseEvent<HTMLInputElement>) => {
        const rows = table.getRowModel().rows;
        if (e.shiftKey && lastClickedRowId !== null) {
          // Shift-click: select range using current visible positions, so the
          // range reflects the user's current sort/filter rather than the
          // pre-sort data order (`row.index` is the original data index).
          const currentPos = rows.findIndex((r) => r.id === row.id);
          const lastPos = rows.findIndex((r) => r.id === lastClickedRowId);

          if (currentPos !== -1 && lastPos !== -1) {
            const start = Math.min(lastPos, currentPos);
            const end = Math.max(lastPos, currentPos);
            const shouldSelect = !row.getIsSelected();

            for (let i = start; i <= end; i++) {
              if (rows[i]?.getCanSelect()) {
                rows[i].toggleSelected(shouldSelect);
              }
            }
          } else {
            // Anchor row is no longer visible (e.g. filtered out): fall back
            // to a single toggle.
            row.getToggleSelectedHandler()(e);
          }
        } else {
          // Normal click: toggle this row
          row.getToggleSelectedHandler()(e);
        }
        setLastClickedRowId(row.id);
      };

      return {
        checked: row.getIsSelected(),
        disabled: !row.getCanSelect(),
        onClick: handleClick,
        // Empty onChange to satisfy React's controlled input requirement
        // (actual state changes are handled via onClick for shift-click support)
        onChange: () => {},
      };
    },
    [lastClickedRowId],
  );

  return {
    lastClickedRowId,
    setLastClickedRowId,
    createCheckboxProps,
  };
}
