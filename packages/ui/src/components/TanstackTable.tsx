import { flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import type { Header, Row, SortDirection, Table } from '@tanstack/table-core';
import clsx from 'clsx';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { JSX } from 'preact/jsx-runtime';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';

import type { ComponentProps } from '@prairielearn/preact-cjs';

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
  onResizeEnd,
}: {
  header: Header<RowDataModel, unknown>;
  setColumnSizing: Table<RowDataModel>['setColumnSizing'];
  onResizeEnd?: () => void;
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
        onMouseUp={onResizeEnd}
        onTouchStart={header.getResizeHandler()}
        onTouchEnd={onResizeEnd}
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
  scrollRef?: React.RefObject<HTMLDivElement> | null;
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
 * @param params.scrollRef - Optional ref that will be attached to the scroll container element.
 */
export function TanstackTable<RowDataModel>({
  table,
  title,
  filters = DEFAULT_FILTER_MAP,
  rowHeight = 42,
  noResultsState = DefaultNoResultsState,
  emptyState = DefaultEmptyState,
  scrollRef,
}: TanstackTableProps<RowDataModel>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = scrollRef ?? parentRef;

  const rows = [...table.getTopRows(), ...table.getCenterRows()];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    measureElement: (el) => el?.getBoundingClientRect().height ?? rowHeight,
  });

  // Check if any column has wrapping enabled
  const hasWrappedColumns = table.getAllLeafColumns().some((col) => col.columnDef.meta?.wrapText);

  // Create callback for remeasuring after resize
  const handleResizeEnd = useMemo(() => {
    if (!hasWrappedColumns) return undefined;
    return () => rowVirtualizer.measure();
  }, [hasWrappedColumns, rowVirtualizer]);

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

    // Only handle arrow keys if we're in the cell itself, not in an interactive element
    const target = e.target as HTMLElement;
    if (target.tagName === 'TD') {
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
      const selector = `[data-grid-cell-row="${next.row}"][data-grid-cell-col="${next.col}"]`;
      const nextCell = tableRef.current?.querySelector(selector) as HTMLElement | null;
      nextCell?.focus();
    }
  };

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

  const noTableResults = table.getVisibleLeafColumns().length === 0 || displayedCount === 0;

  return (
    <div style={{ position: 'relative' }} class="d-flex flex-column h-100">
      <div
        ref={scrollContainerRef}
        style={{
          // This probably isn't the cleanest way to do this, but it works.
          // TODO: It does not work in all cases. Make sure you check that empty states work as intended.
          ...(!noTableResults && {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }),
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
            class="table table-hover mb-0"
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
                                  class="btn btn-link text-muted p-0"
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
                        index === headerGroup.headers.length - 1
                          ? null
                          : header.column.getCanResize() && (
                              <ResizeHandle
                                header={header}
                                setColumnSizing={table.setColumnSizing}
                                onResizeEnd={handleResizeEnd}
                              />
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
                  <tr
                    key={row.id}
                    ref={(node) => rowVirtualizer.measureElement(node)}
                    data-index={virtualRow.index}
                  >
                    {visibleCells.map((cell, colIdx) => {
                      const canSort = cell.column.getCanSort();
                      const canFilter = cell.column.getCanFilter();

                      const wrapText = cell.column.columnDef.meta?.wrapText ?? false;

                      return (
                        <td
                          key={cell.id}
                          tabIndex={0}
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
                            whiteSpace: wrapText ? 'normal' : 'nowrap',
                            overflow: wrapText ? 'visible' : 'hidden',
                            textOverflow: wrapText ? undefined : 'ellipsis',
                            verticalAlign: 'middle',
                          }}
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
      {table.getVisibleLeafColumns().length === 0 || displayedCount === 0 ? (
        <div>
          <div
            class="d-flex flex-column justify-content-center align-items-center p-4"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              // Allow pointer events (e.g. scrolling) to reach the underlying table.
              pointerEvents: 'none',
            }}
            role="status"
            aria-live="polite"
          >
            <div
              class="col-lg-6"
              style={{
                // Allow selecting and interacting with the empty state content.
                pointerEvents: 'auto',
              }}
            >
              {table.getVisibleLeafColumns().length === 0 ? (
                <TanstackTableEmptyState iconName="bi-eye-slash">
                  No columns selected. Use the View menu to show columns.
                </TanstackTableEmptyState>
              ) : displayedCount === 0 ? (
                totalCount > 0 ? (
                  noResultsState
                ) : (
                  emptyState
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A generic component that wraps the TanstackTable component in a card.
 * @param params
 * @param params.table - The table model
 * @param params.title - The title of the card
 * @param params.class - The class name to apply to the card
 * @param params.style - The style to apply to the card
 * @param params.singularLabel - The singular label for a single row in the table, e.g. "student"
 * @param params.pluralLabel - The plural label for multiple rows in the table, e.g. "students"
 * @param params.headerButtons - The buttons to display in the header
 * @param params.columnManagerButtons - The buttons to display next to the column manager (View button)
 * @param params.columnManagerTopContent - Optional content to display at the top of the column manager (View) dropdown menu
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
  class: className,
  singularLabel,
  pluralLabel,
  headerButtons,
  columnManagerButtons,
  columnManagerTopContent,
  globalFilter,
  tableOptions,
  downloadButtonOptions,
  ...divProps
}: {
  table: Table<RowDataModel>;
  title: string;
  singularLabel: string;
  pluralLabel: string;
  headerButtons: JSX.Element;
  columnManagerButtons?: JSX.Element;
  columnManagerTopContent?: JSX.Element;
  globalFilter: {
    value: string;
    setValue: (value: string) => void;
    placeholder: string;
  };
  tableOptions: Partial<Omit<TanstackTableProps<RowDataModel>, 'table'>>;
  downloadButtonOptions?: Omit<
    TanstackTableDownloadButtonProps<RowDataModel>,
    'table' | 'singularLabel' | 'pluralLabel'
  >;
} & ComponentProps<'div'>) {
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    <div class={clsx('card d-flex flex-column', className)} {...divProps}>
      <div class="card-header bg-primary text-white">
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div>{title}</div>
          <div class="d-flex gap-2">
            {headerButtons}

            {downloadButtonOptions && (
              <TanstackTableDownloadButton
                table={table}
                pluralLabel={pluralLabel}
                singularLabel={singularLabel}
                {...downloadButtonOptions}
              />
            )}
          </div>
        </div>
      </div>
      <div class="card-body d-flex flex-row flex-wrap flex-grow-0 align-items-center gap-2">
        <div class="position-relative w-100" style={{ maxWidth: 'min(400px, 100%)' }}>
          <input
            ref={searchInputRef}
            type="text"
            class="form-control tanstack-table-search-input tanstack-table-focusable-shadow"
            aria-label={globalFilter.placeholder}
            placeholder={globalFilter.placeholder}
            value={globalFilter.value}
            autoComplete="off"
            onInput={(e) => {
              if (!(e.target instanceof HTMLInputElement)) return;
              globalFilter.setValue(e.target.value);
            }}
          />
          {globalFilter.value && (
            <OverlayTrigger overlay={<Tooltip>Clear search</Tooltip>}>
              <button
                type="button"
                class="btn btn-link tanstack-table-clear-search"
                aria-label="Clear search"
                onClick={() => globalFilter.setValue('')}
              >
                <i class="bi bi-x-circle-fill" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          )}
        </div>
        <div class="d-flex flex-wrap flex-row align-items-center gap-2">
          <ColumnManager table={table} topContent={columnManagerTopContent} />
          {columnManagerButtons}
        </div>
        <div class="ms-auto text-muted text-nowrap">
          Showing {displayedCount} of {totalCount} {totalCount === 1 ? singularLabel : pluralLabel}
        </div>
      </div>
      <div class="flex-grow-1">
        <TanstackTable table={table} title={title} {...tableOptions} />
      </div>
    </div>
  );
}

export function TanstackTableEmptyState({
  iconName,
  children,
}: {
  iconName: `bi-${string}`;
  children: ComponentChildren;
}) {
  return (
    <div class="d-flex flex-column justify-content-center align-items-center text-muted">
      <i class={clsx('bi', iconName, 'display-4 mb-2')} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
