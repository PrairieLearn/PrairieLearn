import { flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import type { Header, Row, SortDirection, Table } from '@tanstack/table-core';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact/jsx-runtime';

import { ColumnManager } from './ColumnManager.js';

function SortIcon({ sortMethod }: { sortMethod: false | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i class="bi bi-sort-up-alt" aria-hidden="true" />;
  } else if (sortMethod === 'desc') {
    return <i class="bi bi-sort-down" aria-hidden="true" />;
  } else {
    return <i class="bi bi-arrow-down-up opacity-75 text-muted" aria-hidden="true" />;
  }
}

function ResizeHandle<RowDataModel>({
  header,
  setColumnSizing,
}: {
  header: Header<RowDataModel, unknown>;
  setColumnSizing: Table<RowDataModel>['setColumnSizing'];
}) {
  const minSize = header.column.columnDef.minSize ?? 0;
  const maxSize = header.column.columnDef.maxSize ?? 0;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const currentSize = header.getSize();
      const increment = e.shiftKey ? 20 : 5; // Larger increment with Shift key
      const newSize =
        e.key === 'ArrowLeft'
          ? Math.max(minSize, currentSize - increment)
          : Math.min(maxSize, currentSize + increment);

      setColumnSizing((prevSizing) => ({
        ...prevSizing,
        [header.column.id]: newSize,
      }));
    } else if (e.key === 'Home') {
      e.preventDefault();
      header.column.resetSize();
    }
  };

  const columnName =
    typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : header.column.id;

  return (
    <div class="py-1 h-100" style={{ position: 'absolute', right: 0, top: 0, width: '4px' }}>
      {/* separator role is focusable, so these jsx-a11y-x rules are false positives.
        https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/separator_role#focusable_separator
      */}
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions */}
      <div
        role="separator"
        aria-label={`Resize '${columnName}' column`}
        aria-valuetext={`${header.getSize()}px`}
        aria-orientation="vertical"
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={header.getSize()}
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
        tabIndex={0}
        class="h-100"
        style={{
          background: header.column.getIsResizing() ? 'var(--bs-primary)' : 'var(--bs-gray-400)',
          cursor: 'col-resize',
          transition: 'background-color 0.2s',
        }}
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

const DefaultEmptyState = (
  <>
    <i class="bi bi-search display-4 mb-2" aria-hidden="true" />
    <p class="mb-0">No results found matching your search criteria.</p>
  </>
);

interface TanstackTableProps<RowDataModel> {
  table: Table<RowDataModel>;
  filters: Record<string, (props: { header: Header<RowDataModel, unknown> }) => JSX.Element>;
  rowHeight: number;
  emptyState?: JSX.Element;
}

export function TanstackTable<RowDataModel>({
  table,
  filters,
  // enrollmentStatusFilter,
  // setEnrollmentStatusFilter,
  rowHeight = 42,
  emptyState = DefaultEmptyState,
}: {
  table: Table<RowDataModel>;
  // enrollmentStatusFilter: EnumEnrollmentStatus[];
  /** setEnrollmentStatusFilter: (value: EnumEnrollmentStatus[]) => void; */
  emptyState?: JSX.Element;
  rowHeight: number;
  filters: Record<string, (props: { header: Header<RowDataModel, unknown> }) => JSX.Element>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const rows = [...table.getTopRows(), ...table.getCenterRows()];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  // Track focused cell for grid navigation
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });

  const getVisibleCells = (row: Row<RowDataModel>) => [
    ...row.getLeftVisibleCells(),
    ...row.getCenterVisibleCells(),
  ];

  const handleGridKeyDown = (e: KeyboardEvent, rowIdx: number, colIdx: number) => {
    const rowLength = getVisibleCells(rows[rowIdx]).length;
    const adjacentCells: Record<KeyboardEvent['key'], { row: number; col: number }> = {
      ArrowDown: {
        row: Math.min(rows.length - 1, rowIdx + 1),
        col: colIdx,
      },
      ArrowUp: {
        row: Math.max(0, rowIdx - 1),
        col: colIdx,
      },
      ArrowRight: {
        row: rowIdx,
        col: Math.min(rowLength - 1, colIdx + 1),
      },
      ArrowLeft: {
        row: rowIdx,
        col: Math.max(0, colIdx - 1),
      },
    };

    const next = adjacentCells[e.key];
    if (!next) {
      return;
    }

    setFocusedCell({ row: next.row, col: next.col });
    // If we are on the leftmost column, we should allow left scrolling.
    if (colIdx === 0 && e.key === 'ArrowLeft') {
      return;
    }

    // If we are on the top row, we should allow up scrolling.
    if (rowIdx === 0 && e.key === 'ArrowUp') {
      return;
    }

    // If we are on the rightmost column, we should allow right scrolling.
    if (colIdx === rowLength - 1 && e.key === 'ArrowRight') {
      return;
    }

    e.preventDefault();
  };

  useEffect(() => {
    const selector = `[data-grid-cell-row="${focusedCell.row}"][data-grid-cell-col="${focusedCell.col}"]`;
    const cell = tableRef.current?.querySelector(selector) as HTMLElement | null;
    if (!cell) {
      return;
    }
    cell.focus();
  }, [focusedCell]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const [before, after] =
    virtualRows.length > 0
      ? [
          notUndefined(virtualRows[0]).start - rowVirtualizer.options.scrollMargin,
          rowVirtualizer.getTotalSize() - notUndefined(virtualRows.at(-1)).end,
        ]
      : [0, 0];
  const headerGroups = table.getHeaderGroups();
  const isTableResizing = headerGroups.some((headerGroup) =>
    headerGroup.headers.some((header) => header.column.getIsResizing()),
  );
  const lastColumnId = table.getAllLeafColumns()[table.getAllLeafColumns().length - 1].id;

  const tableRect = tableRef.current?.getBoundingClientRect();

  useEffect(() => {
    document.body.classList.toggle('no-user-select', isTableResizing);
  }, [isTableResizing]);

  // Helper function to get aria-sort value
  const getAriaSort = (sortDirection: false | SortDirection) => {
    switch (sortDirection) {
      case 'asc':
        return 'ascending';
      case 'desc':
        return 'descending';
      default:
        return 'none';
    }
  };

  return (
    <div style={{ position: 'relative' }} class="d-flex flex-column h-100">
      <div
        ref={parentRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'auto',
          overflowAnchor: 'none',
        }}
      >
        <div
          ref={tableRef}
          style={{
            position: 'relative',
            width: `max(${table.getTotalSize()}px, 100%)`,
          }}
        >
          <table
            class="table table-hover mb-0 border border-top-0"
            style={{ tableLayout: 'fixed' }}
            aria-label="Students"
            role="grid"
          >
            <thead>
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => {
                    const isPinned = header.column.getIsPinned();
                    const sortDirection = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    const canFilter = header.column.getCanFilter();
                    const columnName =
                      typeof header.column.columnDef.header === 'string'
                        ? header.column.columnDef.header
                        : header.column.id;

                    const style: JSX.CSSProperties = {
                      width:
                        header.column.id === lastColumnId
                          ? `max(100%, ${header.getSize()}px)`
                          : header.getSize(),
                      position: 'sticky',
                      top: 0,
                      zIndex: isPinned === 'left' ? 2 : 1,
                      left: isPinned === 'left' ? header.getStart() : undefined,
                      boxShadow:
                        'inset 0 calc(-1 * var(--bs-border-width)) 0 0 rgba(0, 0, 0, 1), inset 0 var(--bs-border-width) 0 0 var(--bs-border-color)',
                    };

                    return (
                      <th
                        key={header.id}
                        class={clsx(isPinned === 'left' && 'bg-light')}
                        style={style}
                        aria-sort={canSort ? getAriaSort(sortDirection) : undefined}
                        role="columnheader"
                      >
                        <div class="d-flex align-items-center justify-content-between gap-2">
                          <button
                            class="text-nowrap flex-grow-1 text-start"
                            style={{
                              cursor: canSort ? 'pointer' : 'default',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              background: 'transparent',
                              border: 'none',
                            }}
                            type="button"
                            aria-label={
                              canSort
                                ? `'${columnName}' column, current sort is ${getAriaSort(sortDirection)}`
                                : undefined
                            }
                            onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                            onKeyDown={
                              canSort
                                ? (e) => {
                                    const handleSort = header.column.getToggleSortingHandler();
                                    if (e.key === 'Enter' && handleSort) {
                                      e.preventDefault();
                                      handleSort(e);
                                    }
                                  }
                                : undefined
                            }
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && (
                              <span class="ms-2" aria-hidden="true">
                                <SortIcon sortMethod={sortDirection || false} />
                              </span>
                            )}
                            {canSort && (
                              <span class="visually-hidden">
                                , {getAriaSort(sortDirection)}, click to sort
                              </span>
                            )}
                          </button>

                          {canFilter && filters[header.column.id]?.({ header })}
                          {/* {header.column.id === 'enrollment_status' && canFilter && (
                            <StatusColumnFilter
                              columnId={header.column.id}
                              enrollmentStatusFilter={enrollmentStatusFilter}
                              setEnrollmentStatusFilter={setEnrollmentStatusFilter}
                            />
                          )} */}
                        </div>
                        {tableRect?.width &&
                        tableRect.width > table.getTotalSize() &&
                        index === headerGroup.headers.length - 1 ? null : (
                          <ResizeHandle header={header} setColumnSizing={table.setColumnSizing} />
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {before > 0 && (
                <tr tabIndex={-1}>
                  <td colSpan={headerGroups[0].headers.length} style={{ height: before }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                const visibleCells = getVisibleCells(row);
                const rowIdx = virtualRow.index;

                return (
                  <tr key={row.id} style={{ height: rowHeight }}>
                    {visibleCells.map((cell, colIdx) => (
                      <td
                        key={cell.id}
                        // You can tab to the most-recently focused cell.
                        tabIndex={focusedCell.row === rowIdx && focusedCell.col === colIdx ? 0 : -1}
                        // We store this so you can navigate around the grid.
                        data-grid-cell-row={rowIdx}
                        data-grid-cell-col={colIdx}
                        style={{
                          width:
                            cell.column.id === lastColumnId
                              ? `max(100%, ${cell.column.getSize()}px)`
                              : cell.column.getSize(),
                          position: cell.column.getIsPinned() === 'left' ? 'sticky' : undefined,
                          left:
                            cell.column.getIsPinned() === 'left'
                              ? cell.column.getStart()
                              : undefined,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        onFocus={() => setFocusedCell({ row: rowIdx, col: colIdx })}
                        onKeyDown={(e) => handleGridKeyDown(e, rowIdx, colIdx)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {after > 0 && (
                <tr tabIndex={-1}>
                  <td colSpan={headerGroups[0].headers.length} style={{ height: after }} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {table.getVisibleLeafColumns().length === 0 && (
        <div>
          <div
            class="d-flex flex-column justify-content-center align-items-center text-muted py-4"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'var(--bs-body-bg)',
            }}
            role="status"
            aria-live="polite"
          >
            <i class="bi bi-eye-slash display-4 mb-2" aria-hidden="true" />
            <p class="mb-0">No columns selected. Use the View menu to show columns.</p>
          </div>
        </div>
      )}
      {table.getRowModel().rows.length === 0 && (
        <div
          class="d-flex flex-column justify-content-center align-items-center text-muted py-4"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bs-body-bg)',
          }}
          role="status"
          aria-live="polite"
        >
          {emptyState}
        </div>
      )}
    </div>
  );
}

/**
 * A generic component that wraps the TanstackTable component in a card.
 * @param params
 * @param params.table - The table model
 * @param params.title - The title of the card
 * @param params.headerButtons - The buttons to display in the header
 * @param params.globalFilter - The state management for the global filter
 * @param params.globalFilter.value - The value of the global filter
 * @param params.globalFilter.setValue - The function to set the value of the global filter
 * @param params.tableOptions - Specific options for the table. See {@link TanstackTableProps} for more details.
 */
export function TanstackTableCard<RowDataModel>({
  table,
  title,
  headerButtons,
  globalFilter,
  tableOptions,
}: {
  table: Table<RowDataModel>;
  title: string;
  headerButtons: JSX.Element;
  globalFilter: {
    value: string;
    setValue: (value: string) => void;
  };
  tableOptions: Omit<TanstackTableProps<RowDataModel>, 'table'>;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track screen size for aria-hidden
  const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
  const [isMediumOrLarger, setIsMediumOrLarger] = useState(false);

  useEffect(() => {
    // TODO: This is a workaround to avoid a hydration mismatch.
    setIsMediumOrLarger(mediaQuery?.matches ?? true);
  }, [mediaQuery]);

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsMediumOrLarger(e.matches);
    mediaQuery?.addEventListener('change', handler);
    return () => mediaQuery?.removeEventListener('change', handler);
  }, [mediaQuery]);

  // Focus the search input when Ctrl+F is pressed
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        if (searchInputRef.current && searchInputRef.current !== document.activeElement) {
          searchInputRef.current.focus();
          event.preventDefault();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div class="card d-flex flex-column h-100">
      <div class="card-header bg-primary text-white">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div>{title}</div>
          <div class="d-flex gap-2">{headerButtons}</div>
        </div>
      </div>
      <div class="card-body d-flex flex-column">
        <div class="d-flex flex-row flex-wrap align-items-center mb-3 gap-2">
          <div class="flex-grow-1 flex-lg-grow-0 col-xl-6 col-lg-7 d-flex flex-row gap-2">
            <div class="input-group">
              <input
                ref={searchInputRef}
                type="text"
                class="form-control"
                aria-label="Search by UID, name or email."
                placeholder="Search by UID, name, email..."
                value={globalFilter.value}
                onInput={(e) => {
                  if (!(e.target instanceof HTMLInputElement)) return;
                  globalFilter.setValue(e.target.value);
                }}
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Clear search"
                title="Clear search"
                data-bs-toggle="tooltip"
                onClick={() => globalFilter.setValue('')}
              >
                <i class="bi bi-x-circle" aria-hidden="true" />
              </button>
            </div>
            {/* We do this instead of CSS properties for the accessibility checker */}
            {isMediumOrLarger && <ColumnManager table={table} />}
          </div>
          {/* We do this instead of CSS properties for the accessibility checker */}
          {!isMediumOrLarger && <ColumnManager table={table} />}
          <div class="flex-lg-grow-1 d-flex flex-row justify-content-end">
            <div class="text-muted text-nowrap">
              Showing {table.getRowModel().rows.length} of {table.getRowCount()}{' '}
              {title.toLowerCase()}
            </div>
          </div>
        </div>
        <div class="flex-grow-1">
          <TanstackTable
            table={table}
            filters={tableOptions.filters}
            rowHeight={tableOptions.rowHeight}
            emptyState={tableOptions.emptyState}
          />
        </div>
      </div>
    </div>
  );
}
