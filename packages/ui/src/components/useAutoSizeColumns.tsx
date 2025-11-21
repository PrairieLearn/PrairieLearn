import type { ColumnSizingState, Header, Table } from '@tanstack/react-table';
import type { RefObject } from 'preact';
import { render, unmountComponentAtNode } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact/jsx-runtime';

import { TableHeaderCell } from './TanstackTable.js';

interface HiddenMeasurementHeaderProps<TData> {
  table: Table<TData>;
  columnsToMeasure: { id: string }[];
  filters?: Record<string, (props: { header: Header<TData, unknown> }) => JSX.Element>;
}

function HiddenMeasurementHeader<TData>({
  table,
  columnsToMeasure,
  filters = {},
}: HiddenMeasurementHeaderProps<TData>) {
  const headerGroups = table.getHeaderGroups();
  const leafHeaderGroup = headerGroups[headerGroups.length - 1];

  return (
    <div
      style={{
        position: 'fixed',
        visibility: 'hidden',
        pointerEvents: 'none',
        top: '-9999px',
      }}
    >
      <table class="table table-hover mb-0" style={{ display: 'grid', tableLayout: 'fixed' }}>
        <thead style={{ display: 'grid' }}>
          <tr style={{ display: 'flex' }}>
            {columnsToMeasure.map((col) => {
              const header = leafHeaderGroup.headers.find((h) => h.column.id === col.id);
              if (!header) return null;

              return (
                <TableHeaderCell
                  key={header.id}
                  header={header}
                  filters={filters}
                  table={table}
                  isPinned={false}
                  measurementMode={true}
                />
              );
            })}
          </tr>
        </thead>
      </table>
    </div>
  );
}

/**
 * Custom hook that automatically measures and sets column widths based on header content.
 * Only measures columns that don't have explicit sizes set, preserving user resizes.
 *
 * @param table - The TanStack Table instance
 * @param tableRef - Ref to the table container element
 * @param enabled - Whether auto-sizing is enabled (default: true)
 * @param filters - Optional filters map for rendering filter components in measurement
 * @returns A boolean indicating whether measurement has completed
 */
export function useAutoSizeColumns<TData>(
  table: Table<TData>,
  tableRef: RefObject<HTMLDivElement>,
  enabled = true,
  filters?: Record<string, (props: { header: Header<TData, unknown> }) => JSX.Element>,
): boolean {
  const measuredColumnsRef = useRef<Set<string>>(new Set());
  const hasMeasuredRef = useRef(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  const measurementContainerRef = useRef<HTMLDivElement | null>(null);

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

      // Create or reuse the hidden measurement container
      let container = measurementContainerRef.current;
      if (!container) {
        container = document.createElement('div');
        document.body.append(container);
        measurementContainerRef.current = container;
      }

      // Render the hidden measurement header
      render(
        <HiddenMeasurementHeader
          table={table}
          columnsToMeasure={columnsToMeasure}
          filters={filters ?? {}}
        />,
        container,
      );

      // Force layout to ensure styles are applied
      void container.offsetWidth;

      // Measure header cells from the hidden container
      const newSizing: ColumnSizingState = {};

      columnsToMeasure.forEach((col) => {
        const headerElement = container.querySelector(
          `th[data-column-id="${col.id}"]`,
        ) as HTMLElement;

        if (headerElement) {
          // Measure the natural width of the entire header
          const measuredWidth = headerElement.scrollWidth;

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

      // Clean up the measurement container
      unmountComponentAtNode(container);
      container.innerHTML = '';

      // Update column sizing
      if (Object.keys(newSizing).length > 0) {
        table.setColumnSizing((prev) => ({ ...prev, ...newSizing }));
        hasMeasuredRef.current = true;
        setHasMeasured(true);
      }
    }, 100); // Small delay to ensure table is fully rendered

    return () => {
      clearTimeout(timeoutId);
    };
  }, [table, tableRef, enabled, filters]);

  // Clean up measurement container on unmount
  useEffect(() => {
    return () => {
      if (measurementContainerRef.current) {
        unmountComponentAtNode(measurementContainerRef.current);
        measurementContainerRef.current.remove();
        measurementContainerRef.current = null;
      }
    };
  }, []);

  // Reset measured columns when columns change
  const columnIds = table
    .getVisibleLeafColumns()
    .map((col) => col.id)
    .join(',');
  useEffect(() => {
    measuredColumnsRef.current.clear();
    hasMeasuredRef.current = false;
    // Reset measurement state when columns change

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setHasMeasured(false);
  }, [columnIds]);

  return hasMeasured;
}
