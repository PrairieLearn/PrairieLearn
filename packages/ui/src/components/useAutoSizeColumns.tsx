import type { ColumnSizingState, Header, Table } from '@tanstack/react-table';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';

import { TanstackTableHeaderCell } from './TanstackTableHeaderCell.js';

function HiddenMeasurementHeader<TData>({
  table,
  columnsToMeasure,
  filters = {},
}: {
  table: Table<TData>;
  columnsToMeasure: { id: string }[];
  filters?: Record<string, (props: { header: Header<TData, unknown> }) => ReactNode>;
}) {
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
      <table className="table table-hover mb-0" style={{ display: 'grid', tableLayout: 'fixed' }}>
        <thead style={{ display: 'grid' }}>
          <tr style={{ display: 'flex' }}>
            {columnsToMeasure.map((col) => {
              const header = leafHeaderGroup.headers.find((h) => h.column.id === col.id);
              if (!header) return null;

              return (
                <TanstackTableHeaderCell
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
 * Only measures columns that have `meta: { autoSize: true }` and don't have explicit sizes set.
 * User resizes are preserved.
 *
 * @param table - The TanStack Table instance
 * @param tableRef - Ref to the table container element
 * @param filters - Optional filters map for rendering filter components in measurement
 * @returns A boolean indicating whether the initial measurement has completed
 */
export function useAutoSizeColumns<TData>(
  table: Table<TData>,
  tableRef: RefObject<HTMLDivElement | null>,
  filters?: Record<string, (props: { header: Header<TData, unknown> }) => ReactNode>,
): boolean {
  const measurementContainerRef = useRef<HTMLDivElement | null>(null);
  const measurementRootRef = useRef<Root | null>(null);

  // Compute columns that need measuring
  const columnsToMeasure = useMemo(() => {
    const allColumns = table.getAllLeafColumns();
    return allColumns.filter((col) => col.columnDef.meta?.autoSize);
  }, [table]);

  // Initialize hasMeasured to true if there's nothing to measure
  const [hasMeasured, setHasMeasured] = useState(() => columnsToMeasure.length === 0);

  // Perform measurement
  useEffect(() => {
    if (hasMeasured || !tableRef.current || columnsToMeasure.length === 0) {
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
        measurementRootRef.current = createRoot(container);
      }

      // Render headers into hidden container. We need to use `flushSync` to ensure
      // that it's rendered synchronously before we measure.
      // eslint-disable-next-line @eslint-react/dom/no-flush-sync
      flushSync(() => {
        measurementRootRef.current?.render(
          <HiddenMeasurementHeader
            table={table}
            columnsToMeasure={columnsToMeasure}
            filters={filters ?? {}}
          />,
        );
      });

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

      // Clear container content by unmounting React components
      measurementRootRef.current?.unmount();
      measurementRootRef.current = null;

      // Apply measurements
      if (Object.keys(newSizing).length > 0) {
        table.setColumnSizing((prev) => ({ ...prev, ...newSizing }));
      }

      setHasMeasured(true);
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [table, tableRef, filters, hasMeasured, columnsToMeasure]);

  // Clean up measurement container on unmount
  useEffect(() => {
    return () => {
      measurementRootRef.current?.unmount();
      measurementRootRef.current = null;
      const container = measurementContainerRef.current;
      if (container) {
        container.remove();
        measurementContainerRef.current = null;
      }
    };
  }, []);

  return hasMeasured;
}
