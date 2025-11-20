import type { ColumnSizingState, Table } from '@tanstack/react-table';
import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Custom hook that automatically measures and sets column widths based on header content.
 * Only measures columns that don't have explicit sizes set, preserving user resizes.
 *
 * @param table - The TanStack Table instance
 * @param tableRef - Ref to the table container element
 * @param enabled - Whether auto-sizing is enabled (default: true)
 */
export function useAutoSizeColumns<TData>(
  table: Table<TData>,
  tableRef: RefObject<HTMLDivElement>,
  enabled = true,
) {
  const measuredColumnsRef = useRef<Set<string>>(new Set());
  const hasMeasuredRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasMeasuredRef.current) {
      return;
    }
    if (!tableRef.current) {
      return;
    }

    // Get columns that need measurement (no explicit size in columnSizing and haven't been measured)
    // Note: TanStack Table only adds entries to columnSizing when explicitly set.
    // If a column is not in columnSizing, it's using the default size and should be measured.
    const allColumns = table.getVisibleLeafColumns();
    const columnSizing = table.getState().columnSizing;

    const columnsToMeasure = allColumns.filter((col) => {
      const currentSize = columnSizing[col.id];
      const alreadyMeasured = measuredColumnsRef.current.has(col.id);

      // If currentSize is undefined, the column is not in columnSizing state,
      // which means it's using the default size and hasn't been explicitly set.
      // This is the key: we only measure columns that aren't in columnSizing state,
      // regardless of what col.columnDef.size says (since defaultColumn sets it).
      const isUsingDefault = currentSize === undefined;

      return isUsingDefault && !alreadyMeasured;
    });

    if (columnsToMeasure.length === 0) {
      return;
    }

    // Use a small delay to ensure the table is fully rendered and styled
    // This is necessary because the table might render asynchronously
    const timeoutId = setTimeout(() => {
      if (!tableRef.current) {
        return;
      }

      // Find the table element - it might be nested inside the container
      const tableElement = tableRef.current.querySelector('table[role="grid"]');
      if (!tableElement) {
        return;
      }

      // Measure header cells
      const newSizing: ColumnSizingState = {};

      columnsToMeasure.forEach((col) => {
        const headerElement = tableElement.querySelector(
          `th[data-column-id="${col.id}"]`,
        ) as HTMLElement;

        if (headerElement) {
          // Measure the entire header content by temporarily removing width constraints
          // This includes all content: badge, text, sort button, filter, padding, etc.
          const originalWidth = headerElement.style.width;
          const originalMaxWidth = headerElement.style.maxWidth;
          const originalMinWidth = headerElement.style.minWidth;
          const originalDisplay = headerElement.style.display;

          // Temporarily remove width constraints to allow natural expansion
          headerElement.style.width = 'auto';
          headerElement.style.maxWidth = 'none';
          headerElement.style.minWidth = '0';
          headerElement.style.display = 'inline-block';

          // Also remove constraints from the inner flex container
          const innerFlexContainer = headerElement.querySelector('div.d-flex') as HTMLElement;
          const originalInnerWidth = innerFlexContainer?.style.width;
          const originalInnerMaxWidth = innerFlexContainer?.style.maxWidth;
          if (innerFlexContainer) {
            innerFlexContainer.style.width = 'auto';
            innerFlexContainer.style.maxWidth = 'none';
          }

          // Force reflow to ensure styles are applied
          void headerElement.offsetWidth;

          // Measure the natural width of the entire header
          const measuredWidth = headerElement.scrollWidth;

          // Restore original styles
          headerElement.style.width = originalWidth;
          headerElement.style.maxWidth = originalMaxWidth;
          headerElement.style.minWidth = originalMinWidth;
          headerElement.style.display = originalDisplay;
          if (innerFlexContainer) {
            innerFlexContainer.style.width = originalInnerWidth;
            innerFlexContainer.style.maxWidth = originalInnerMaxWidth;
          }

          // Add padding for resize handle if resizable (4px for the handle)
          const resizeHandlePadding = col.getCanResize() ? 4 : 0;

          // Respect minSize and maxSize constraints
          const minSize = col.columnDef.minSize ?? 0;
          const maxSize = col.columnDef.maxSize ?? Infinity;
          const finalWidth = Math.max(
            minSize,
            Math.min(maxSize, measuredWidth + resizeHandlePadding),
          );

          newSizing[col.id] = finalWidth;
          measuredColumnsRef.current.add(col.id);
        }
      });

      // Update column sizing
      if (Object.keys(newSizing).length > 0) {
        table.setColumnSizing((prev) => ({ ...prev, ...newSizing }));
        hasMeasuredRef.current = true;
      }
    }, 100); // Small delay to ensure table is fully rendered

    return () => {
      clearTimeout(timeoutId);
    };
  }, [table, tableRef, enabled]);

  // Reset measured columns when columns change
  const columnIds = table
    .getVisibleLeafColumns()
    .map((col) => col.id)
    .join(',');
  useEffect(() => {
    measuredColumnsRef.current.clear();
    hasMeasuredRef.current = false;
  }, [columnIds]);
}
