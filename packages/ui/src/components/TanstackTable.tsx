import { flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import type { Header, Row, SortDirection, Table } from '@tanstack/table-core';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact/jsx-runtime';

import { ColumnManager } from './ColumnManager.js';
import {
  TanstackTableDownloadButton,
  type TanstackTableDownloadButtonProps,
} from './TanstackTableDownloadButton.js';

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

const DefaultNoResultsState = (
  <>
    <i class="bi bi-search display-4 mb-2" aria-hidden="true" />
    <p class="mb-0">No results found matching your search criteria.</p>
  </>
);

const DefaultEmptyState = (
  <>
    <i class="bi bi-eye-slash display-4 mb-2" aria-hidden="true" />
    <p class="mb-0">No results found.</p>
  </>
);

interface TanstackTableProps<RowDataModel> {
  table: Table<RowDataModel>;
  title: string;
  filters?: Record<string, (props: { header: Header<RowDataModel, unknown> }) => JSX.Element>;
  rowHeight?: number;
  noResultsState?: JSX.Element;
  emptyState?: JSX.Element;
}

const DEFAULT_FILTER_MAP = {};

/**
 * A generic component that renders a full-width, resizeable Tanstack Table.
 * @param params
 * @param params.table - The table model
 * @param params.title - The title of the table
 * @param params.filters - The filters for the table
 * @param params.rowHeight - The height of the rows in the table
 * @param params.noResultsState - The no results state for the table
 * @param params.emptyState - The empty state for the table
 */
export function TanstackTable<RowDataModel>({
  table,
  title,
  filters = DEFAULT_FILTER_MAP,
  rowHeight = 42,
  noResultsState = DefaultNoResultsState,
  emptyState = DefaultEmptyState,
}: TanstackTableProps<RowDataModel>) {
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

  // We toggle this here instead of in the parent since this component logically manages all UI for the table.
  // eslint-disable-next-line react-you-might-not-need-an-effect/no-manage-parent
  useEffect(() => {
    document.body.classList.toggle('no-user-select', isTableResizing);
  }, [isTableResizing]);

  // Dismiss popovers when their triggering element scrolls out of view
  useEffect(() => {
    const handleScroll = () => {
      const scrollElement = parentRef.current;
      if (!scrollElement) return;

      // Find and check all open popovers
      const popovers = document.querySelectorAll('.popover.show');
      popovers.forEach((popover) => {
        // Find the trigger element for this popover
        const triggerElement = document.querySelector(`[aria-describedby="${popover.id}"]`);
        if (!triggerElement) return;

        // Check if the trigger element is still visible in the scroll container
        const scrollRect = scrollElement.getBoundingClientRect();
        const triggerRect = triggerElement.getBoundingClientRect();

        // Check if trigger is outside the visible scroll area
        const isOutOfView =
          triggerRect.bottom < scrollRect.top ||
          triggerRect.top > scrollRect.bottom ||
          triggerRect.right < scrollRect.left ||
          triggerRect.left > scrollRect.right;

        if (isOutOfView) {
          // Use Bootstrap's Popover API to properly hide it
          const popoverInstance = (window as any).bootstrap?.Popover?.getInstance(triggerElement);
          if (popoverInstance) {
            popoverInstance.hide();
          }
        }
      });
    };

    const scrollElement = parentRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, []);

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

  const displayedCount = table.getRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;

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
            aria-label={title}
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
                        <div
                          class={clsx(
                            'd-flex align-items-center',
                            canSort || canFilter
                              ? 'justify-content-between'
                              : 'justify-content-center',
                          )}
                        >
                          <button
                            class={clsx(
                              'text-nowrap text-start',
                              canSort || canFilter ? 'flex-grow-1' : '',
                            )}
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
                              <span class="visually-hidden">
                                , {getAriaSort(sortDirection)}, click to sort
                              </span>
                            )}
                          </button>

                          {(canSort || canFilter) && (
                            <div class="d-flex align-items-center">
                              {canSort && (
                                <button
                                  type="button"
                                  class="btn btn-link text-muted p-0 ms-2"
                                  aria-label={`Sort ${columnName.toLowerCase()}`}
                                  title={`Sort ${columnName.toLowerCase()}`}
                                  onClick={header.column.getToggleSortingHandler()}
                                >
                                  <SortIcon sortMethod={sortDirection || false} />
                                </button>
                              )}
                              {canFilter && filters[header.column.id]?.({ header })}
                            </div>
                          )}
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
                    {visibleCells.map((cell, colIdx) => {
                      const canSort = cell.column.getCanSort();
                      const canFilter = cell.column.getCanFilter();

                      return (
                        <td
                          key={cell.id}
                          // You can tab to the most-recently focused cell.
                          tabIndex={
                            focusedCell.row === rowIdx && focusedCell.col === colIdx ? 0 : -1
                          }
                          // We store this so you can navigate around the grid.
                          data-grid-cell-row={rowIdx}
                          data-grid-cell-col={colIdx}
                          class={clsx(!canSort && !canFilter && 'text-center')}
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
                      );
                    })}
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
      {displayedCount === 0 && (
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
          {totalCount > 0 ? noResultsState : emptyState}
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
 * @param params.globalFilter - State management for the global filter
 * @param params.globalFilter.value
 * @param params.globalFilter.setValue
 * @param params.globalFilter.placeholder
 * @param params.tableOptions - Specific options for the table. See {@link TanstackTableProps} for more details.
 * @param params.downloadButtonOptions - Specific options for the download button. See {@link TanstackTableDownloadButtonProps} for more details.
 */
export function TanstackTableCard<RowDataModel>({
  table,
  title,
  headerButtons,
  globalFilter,
  tableOptions,
  downloadButtonOptions = null,
}: {
  table: Table<RowDataModel>;
  title: string;
  headerButtons: JSX.Element;
  globalFilter: {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
  };
  tableOptions: Partial<Omit<TanstackTableProps<RowDataModel>, 'table'>>;
  downloadButtonOptions?: Omit<TanstackTableDownloadButtonProps<RowDataModel>, 'table'> | null;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track screen size for aria-hidden
  const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
  const [isMediumOrLarger, setIsMediumOrLarger] = useState(false);

  useEffect(() => {
    // TODO: This is a workaround to avoid a hydration mismatch.
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
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

  const displayedCount = table.getRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;

  return (
    <div class="card d-flex flex-column h-100">
      <div class="card-header bg-primary text-white">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div>{title}</div>
          <div class="d-flex gap-2">
            {headerButtons}

            {downloadButtonOptions && (
              <TanstackTableDownloadButton table={table} {...downloadButtonOptions} />
            )}
          </div>
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
                aria-label={globalFilter.placeholder}
                placeholder={globalFilter.placeholder}
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
            {/* We do this instead of CSS properties for the accessibility checker.
              We can't have two elements with the same id of 'column-manager-button'. */}
            {isMediumOrLarger && <ColumnManager table={table} />}
          </div>
          {/* We do this instead of CSS properties for the accessibility checker.
            We can't have two elements with the same id of 'column-manager-button'. */}
          {!isMediumOrLarger && <ColumnManager table={table} />}
          <div class="flex-lg-grow-1 d-flex flex-row justify-content-end">
            <div class="text-muted text-nowrap">
              Showing {displayedCount} of {totalCount} {title.toLowerCase()}
            </div>
          </div>
        </div>
        <div class="flex-grow-1">
          <TanstackTable table={table} title={title} {...tableOptions} />
        </div>
      </div>
    </div>
  );
}
