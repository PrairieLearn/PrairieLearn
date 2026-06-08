import { type Column, type ColumnSizingState, type Table, flexRender } from '@tanstack/react-table';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';

import { type ColumnFilter, TanstackTableHeaderCell } from './TanstackTableHeaderCell.js';

function HiddenMeasurementHeader<TData>({
  table,
  columnsToMeasure,
  filters = {},
}: {
  table: Table<TData>;
  columnsToMeasure: { id: string }[];
  filters?: Record<string, ColumnFilter<TData>>;
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

function HiddenMeasurementCells<TData>({
  table,
  columnsToMeasure,
}: {
  table: Table<TData>;
  columnsToMeasure: Column<TData, unknown>[];
}) {
  const rows = table.getRowModel().rows;
  const data = rows.map((row) => row.original);

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
        <tbody style={{ display: 'grid' }}>
          {columnsToMeasure.map((col) => {
            const sampleFn = col.columnDef.meta?.autoSizeSample;
            if (!sampleFn) return null;

            const sampleIndices = sampleFn(data);

            return sampleIndices.map((idx) => {
              const row = rows[idx];
              if (!row) return null;
              const cell = row.getAllCells().find((c) => c.column.id === col.id);
              if (!cell) return null;

              return (
                <tr key={`${col.id}-${idx}`} style={{ display: 'flex' }}>
                  <td
                    data-measure-cell={col.id}
                    style={{ display: 'flex', minWidth: 0, flexShrink: 0 }}
                  >
                    <div style={{ display: 'block', minWidth: 0, whiteSpace: 'nowrap' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
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
  filters?: Record<string, ColumnFilter<TData>>,
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

      const columnsWithSamples = columnsToMeasure.filter(
        (col) => col.columnDef.meta?.autoSizeSample,
      );

      // Render headers and sample cells into hidden container. We need to use
      // `flushSync` to ensure it's rendered synchronously before we measure.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync
      flushSync(() => {
        measurementRootRef.current?.render(
          <>
            <HiddenMeasurementHeader
              table={table}
              columnsToMeasure={columnsToMeasure}
              filters={filters ?? {}}
            />
            {columnsWithSamples.length > 0 && (
              <HiddenMeasurementCells table={table} columnsToMeasure={columnsWithSamples} />
            )}
          </>,
        );
      });

      // Force layout calculation
      void container.offsetWidth;

      // Measure each header and build sizing state
      const newSizing: ColumnSizingState = {};

      for (const col of columnsToMeasure) {
        const resizeHandlePadding = col.getCanResize() ? 4 : 0;
        const minSize = col.columnDef.minSize ?? 0;
        const maxSize = col.columnDef.maxSize ?? Infinity;

        let measuredWidth = 0;

        const headerElement = container.querySelector(
          `th[data-column-id="${col.id}"]`,
        ) as HTMLElement;
        if (headerElement) {
          measuredWidth = headerElement.scrollWidth;
        }

        // Also measure sample cells if present
        const cellElements = container.querySelectorAll(`td[data-measure-cell="${col.id}"]`);
        for (const cellEl of cellElements) {
          measuredWidth = Math.max(measuredWidth, (cellEl as HTMLElement).scrollWidth);
        }

        if (measuredWidth > 0) {
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
