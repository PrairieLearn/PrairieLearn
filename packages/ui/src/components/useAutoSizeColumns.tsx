import type { ColumnSizingState, Header, Table } from '@tanstack/react-table';
import type { RefObject } from 'preact';
import { render } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
 * @param filters - Optional filters map for rendering filter components in measurement
 * @returns A boolean indicating whether the initial measurement has completed
 */
export function useAutoSizeColumns<TData>(
  table: Table<TData>,
  tableRef: RefObject<HTMLDivElement>,
  filters?: Record<string, (props: { header: Header<TData, unknown> }) => JSX.Element>,
): boolean {
  const [hasMeasured, setHasMeasured] = useState(false);
  const measurementContainerRef = useRef<HTMLDivElement | null>(null);

  // Track visible column IDs to detect when columns change
  const visibleColumnIds = useMemo(
    () => table.getVisibleLeafColumns().map((col) => col.id),
    [table],
  );

  // Create a stable string representation for dependency tracking
  const columnIdsKey = useMemo(() => visibleColumnIds.join(','), [visibleColumnIds]);

  // Reset measurement state when columns change
  useEffect(() => {
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setHasMeasured(false);
  }, [columnIdsKey]);

  // Perform measurement
  useEffect(() => {
    if (hasMeasured || !tableRef.current) {
      return;
    }

    const allColumns = table.getVisibleLeafColumns();
    const columnSizing = table.getState().columnSizing;

    // Find columns that need measurement (not in columnSizing state = using default size)
    const columnsToMeasure = allColumns.filter((col) => {
      return columnSizing[col.id] === undefined;
    });

    if (columnsToMeasure.length === 0) {
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setHasMeasured(true);
      return;
    }

    // Wait for next frame to ensure DOM is ready
    const rafId = requestAnimationFrame(() => {
      if (!tableRef.current) {
        return;
      }

      // Create or reuse measurement container
      let container = measurementContainerRef.current;
      if (!container) {
        container = document.createElement('div');
        document.body.append(container);
        measurementContainerRef.current = container;
      }

      // Render headers into hidden container
      render(
        <HiddenMeasurementHeader
          table={table}
          columnsToMeasure={columnsToMeasure}
          filters={filters ?? {}}
        />,
        container,
      );

      // Force layout calculation
      void container.offsetWidth;

      // Measure each header and build sizing state
      const newSizing: ColumnSizingState = {};

      for (const col of columnsToMeasure) {
        const headerElement = container.querySelector(
          `th[data-column-id="${col.id}"]`,
        ) as HTMLElement;

        if (headerElement) {
          const measuredWidth = headerElement.scrollWidth;
          const resizeHandlePadding = col.getCanResize() ? 4 : 0;
          const minSize = col.columnDef.minSize ?? 0;
          const maxSize = col.columnDef.maxSize ?? Infinity;

          const finalWidth = Math.max(
            minSize,
            Math.min(maxSize, measuredWidth + resizeHandlePadding),
          );

          newSizing[col.id] = finalWidth;
        }
      }

      // Clear container content
      container.innerHTML = '';

      // Apply measurements
      if (Object.keys(newSizing).length > 0) {
        table.setColumnSizing((prev) => ({ ...prev, ...newSizing }));
      }

      setHasMeasured(true);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [table, tableRef, filters, hasMeasured, columnIdsKey]);

  // Clean up measurement container on unmount
  useEffect(() => {
    return () => {
      const container = measurementContainerRef.current;
      if (container) {
        container.innerHTML = '';
        container.remove();
        measurementContainerRef.current = null;
      }
    };
  }, []);

  return hasMeasured;
}
