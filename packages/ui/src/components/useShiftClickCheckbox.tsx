import type { Row, Table } from '@tanstack/react-table';
import { type MouseEvent, useCallback, useState } from 'preact/compat';

/**
 * A hook that provides shift-click range selection functionality for table checkboxes.
 * Use this hook in the parent component and pass the returned props to individual checkboxes.
 *
 * @example
 * ```tsx
 * const { lastClickedRowIndex, createCheckboxProps } = useShiftClickCheckbox();
 *
 * // In your column definition:
 * cell: ({ row, table }) => {
 *   return <input type="checkbox" {...createCheckboxProps(row, table)} />;
 * }
 * ```
 */
export function useShiftClickCheckbox<TData>() {
  const [lastClickedRowIndex, setLastClickedRowIndex] = useState<number | null>(null);

  /**
   * Creates props for a checkbox that supports shift-click range selection.
   * @param row - The TanStack Table row
   * @param table - The TanStack Table instance
   * @returns Props to spread on the checkbox input element
   */
  const createCheckboxProps = useCallback(
    (row: Row<TData>, table: Table<TData>) => {
      const handleClick = (e: MouseEvent<HTMLInputElement>) => {
        if (e.shiftKey && lastClickedRowIndex !== null) {
          // Shift-click: select range
          const currentIndex = row.index;
          const start = Math.min(lastClickedRowIndex, currentIndex);
          const end = Math.max(lastClickedRowIndex, currentIndex);

          // Get all rows in the range
          const rows = table.getRowModel().rows;
          const shouldSelect = !row.getIsSelected();

          // Select or deselect all rows in the range
          for (let i = start; i <= end; i++) {
            if (rows[i]?.getCanSelect()) {
              rows[i].toggleSelected(shouldSelect);
            }
          }
        } else {
          // Normal click: toggle this row
          row.getToggleSelectedHandler()(e);
        }
        setLastClickedRowIndex(row.index);
      };

      return {
        checked: row.getIsSelected(),
        disabled: !row.getCanSelect(),
        onClick: handleClick,
      };
    },
    [lastClickedRowIndex],
  );

  return {
    lastClickedRowIndex,
    setLastClickedRowIndex,
    createCheckboxProps,
  };
}
