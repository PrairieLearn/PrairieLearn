import { flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Cell, Header, Row, Table } from '@tanstack/table-core';
import clsx from 'clsx';
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { useDebouncedCallback } from 'use-debounce';

import { run } from '@prairielearn/run';

import { ColumnManager } from './ColumnManager.js';
import {
  TanstackTableDownloadButton,
  type TanstackTableDownloadButtonProps,
} from './TanstackTableDownloadButton.js';
import { TanstackTableHeaderCell } from './TanstackTableHeaderCell.js';
import { useAutoSizeColumns } from './useAutoSizeColumns.js';

function TableCell<RowDataModel>({
  cell,
  rowIdx,
  colIdx,
  canSort,
  canFilter,
  wrapText,
  handleGridKeyDown,
}: {
  cell: Cell<RowDataModel, unknown>;
  rowIdx: number;
  colIdx: number;
  canSort: boolean;
  canFilter: boolean;
  wrapText: boolean;
  handleGridKeyDown: (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => void;
}) {
  return (
    <td
      key={cell.id}
      tabIndex={0}
      data-grid-cell-row={rowIdx}
      data-grid-cell-col={colIdx}
      className={clsx(!canSort && !canFilter && 'text-center')}
      style={{
        display: 'flex',
        width: cell.column.getSize(),
        minWidth: 0,
        maxWidth: cell.column.getSize(),
        flexShrink: 0,
        position: cell.column.getIsPinned() === 'left' ? 'sticky' : undefined,
        left: cell.column.getIsPinned() === 'left' ? cell.column.getStart() : undefined,
        verticalAlign: 'middle',
      }}
      onKeyDown={(e) => handleGridKeyDown(e, rowIdx, colIdx)}
    >
      <div
        style={{
          display: 'block',
          minWidth: 0,
          maxWidth: '100%',
          overflow: wrapText ? 'visible' : 'hidden',
          textOverflow: wrapText ? undefined : 'ellipsis',
          whiteSpace: wrapText ? 'normal' : 'nowrap',
          flex: '1 1 0%',
          width: 0, // Allow flex to control width, but start from 0
        }}
      >
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </div>
    </td>
  );
}

const DefaultNoResultsState = (
  <TanstackTableEmptyState iconName="bi-search">
    No results found matching your search criteria.
  </TanstackTableEmptyState>
);

const DefaultEmptyState = (
  <TanstackTableEmptyState iconName="bi-eye-slash">No results found.</TanstackTableEmptyState>
);

interface TanstackTableProps<RowDataModel> {
  table: Table<RowDataModel>;
  title: string;
  filters?: Record<string, (props: { header: Header<RowDataModel, unknown> }) => ReactNode>;
  rowHeight?: number;
  noResultsState?: ReactNode;
  emptyState?: ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null> | null;
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

  const visibleColumns = table.getVisibleLeafColumns();
  const centerColumns = visibleColumns.filter((col) => !col.getIsPinned());

  const columnVirtualizer = useVirtualizer({
    count: centerColumns.length,
    estimateSize: (index) => centerColumns[index]?.getSize(),
    // `useAutoSizeColumns` solves a different problem (happens once when the column set changes)
    // and we don't need to measure the cells themselves, so we can use the default estimateSize.
    getScrollElement: () => scrollContainerRef.current,
    horizontal: true,
    overscan: 3,
  });

  const virtualColumns = columnVirtualizer.getVirtualItems();

  const virtualPaddingLeft = run(() => {
    if (columnVirtualizer && virtualColumns?.length > 0) {
      return virtualColumns[0]?.start ?? 0;
    }
    return null;
  });

  const virtualPaddingRight = run(() => {
    if (columnVirtualizer && virtualColumns?.length > 0) {
      return (
        columnVirtualizer.getTotalSize() - (virtualColumns[virtualColumns.length - 1]?.end ?? 0)
      );
    }
    return null;
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

  const handleGridKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
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

  const headerGroups = table.getHeaderGroups();

  const leafHeaderGroup = headerGroups[headerGroups.length - 1];

  const leftPinnedHeaders = leafHeaderGroup.headers.filter(
    (header) => header.column.getIsPinned() === 'left',
  );
  const centerHeaders = leafHeaderGroup.headers.filter((header) => !header.column.getIsPinned());

  const isTableResizing = leafHeaderGroup.headers.some((header) => header.column.getIsResizing());

  // We toggle this here instead of in the parent since this component logically manages all UI for the table.
  useEffect(() => {
    document.body.classList.toggle('pl-ui-no-user-select', isTableResizing);
  }, [isTableResizing]);

  const hasAutoSized = useAutoSizeColumns(table, tableRef, filters);

  // Re-measure the virtualizer when auto-sizing completes
  useEffect(() => {
    if (hasAutoSized) {
      // https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect/issues/58
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-ref-to-parent
      columnVirtualizer.measure();
    }
  }, [columnVirtualizer, hasAutoSized]);

  const displayedCount = table.getRowModel().rows.length;
  const totalCount = table.getCoreRowModel().rows.length;

  return (
    <div style={{ position: 'relative' }} className="d-flex flex-column h-100">
      <div
        ref={scrollContainerRef}
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
            className="table table-hover mb-0"
            style={{ display: 'grid', tableLayout: 'fixed' }}
            aria-label={title}
            role="grid"
          >
            <thead
              className="position-sticky top-0 w-100 border-top"
              style={{
                display: 'grid',
                zIndex: 1,
                borderBottom: 'var(--bs-border-width) solid black',
              }}
            >
              <tr
                key={leafHeaderGroup.id}
                className="d-flex w-100"
                style={{ minWidth: `${table.getTotalSize()}px` }}
              >
                {/* Left pinned columns */}
                {leftPinnedHeaders.map((header) => {
                  return (
                    <TanstackTableHeaderCell
                      key={header.id}
                      header={header}
                      filters={filters}
                      table={table}
                      handleResizeEnd={handleResizeEnd}
                      isPinned="left"
                    />
                  );
                })}

                {/* Virtual padding for left side of center columns */}
                {virtualPaddingLeft ? (
                  <th style={{ display: 'flex', width: virtualPaddingLeft }} />
                ) : null}

                {/* Virtualized center columns */}
                {virtualColumns.map((virtualColumn) => {
                  const header = centerHeaders[virtualColumn.index];
                  if (!header) return null;

                  return (
                    <TanstackTableHeaderCell
                      key={header.id}
                      header={header}
                      filters={filters}
                      table={table}
                      handleResizeEnd={handleResizeEnd}
                      isPinned={false}
                    />
                  );
                })}

                {/* Virtual padding for right side of center columns */}
                {virtualPaddingRight ? (
                  <th style={{ display: 'flex', width: virtualPaddingRight }} />
                ) : null}

                {/* Filler to span remaining width */}
                <th
                  tabIndex={-1}
                  className="d-flex flex-grow-1 p-0"
                  style={{ minWidth: 0 }}
                  aria-hidden="true"
                />
              </tr>
            </thead>
            <tbody
              className="position-relative w-100"
              style={{
                display: 'grid',
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                const rowIdx = virtualRow.index;
                const leftPinnedCells = row.getLeftVisibleCells();
                const centerCells = row.getCenterVisibleCells();

                let currentColIdx = 0;

                return (
                  <tr
                    key={row.id}
                    ref={(node) => rowVirtualizer.measureElement(node)}
                    data-index={virtualRow.index}
                    className="d-flex position-absolute w-100"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      minWidth: `${table.getTotalSize()}px`,
                    }}
                  >
                    {leftPinnedCells.map((cell) => {
                      const colIdx = currentColIdx++;
                      const canSort = cell.column.getCanSort();
                      const canFilter = cell.column.getCanFilter();
                      const wrapText = cell.column.columnDef.meta?.wrapText ?? false;

                      return (
                        <TableCell
                          key={cell.id}
                          cell={cell}
                          rowIdx={rowIdx}
                          colIdx={colIdx}
                          canSort={canSort}
                          canFilter={canFilter}
                          wrapText={wrapText}
                          handleGridKeyDown={handleGridKeyDown}
                        />
                      );
                    })}

                    {virtualPaddingLeft ? (
                      <td style={{ display: 'flex', width: virtualPaddingLeft }} />
                    ) : null}

                    {virtualColumns.map((virtualColumn) => {
                      const cell = centerCells[virtualColumn.index];
                      if (!cell) return null;

                      const colIdx = currentColIdx++;
                      const canSort = cell.column.getCanSort();
                      const canFilter = cell.column.getCanFilter();
                      const wrapText = cell.column.columnDef.meta?.wrapText ?? false;

                      return (
                        <TableCell
                          key={cell.id}
                          cell={cell}
                          rowIdx={rowIdx}
                          colIdx={colIdx}
                          canSort={canSort}
                          canFilter={canFilter}
                          wrapText={wrapText}
                          handleGridKeyDown={handleGridKeyDown}
                        />
                      );
                    })}

                    {virtualPaddingRight ? (
                      <td style={{ display: 'flex', width: virtualPaddingRight }} />
                    ) : null}

                    {/* Filler to span remaining width */}
                    <td
                      tabIndex={-1}
                      className="d-flex flex-grow-1 p-0"
                      style={{ minWidth: 0 }}
                      aria-hidden="true"
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {table.getVisibleLeafColumns().length === 0 || displayedCount === 0 ? (
        <div>
          <div
            className="d-flex flex-column justify-content-center align-items-center p-4"
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
              className="col-lg-6"
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
 * @param params.className - The class name to apply to the card
 * @param params.style - The style to apply to the card
 * @param params.singularLabel - The singular label for a single row in the table, e.g. "student"
 * @param params.pluralLabel - The plural label for multiple rows in the table, e.g. "students"
 * @param params.headerButtons - The buttons to display in the header
 * @param params.columnManager - Optional configuration for the column manager. See {@link ColumnManager} for more details.
 * @param params.columnManager.buttons - The buttons to display next to the column manager (View button)
 * @param params.columnManager.topContent - Optional content to display at the top of the column manager (View) dropdown menu
 * @param params.globalFilter - Configuration for the global filter
 * @param params.globalFilter.placeholder - Placeholder text for the search input
 * @param params.tableOptions - Specific options for the table. See {@link TanstackTableProps} for more details.
 * @param params.downloadButtonOptions - Specific options for the download button. See {@link TanstackTableDownloadButtonProps} for more details.
 */
export function TanstackTableCard<RowDataModel>({
  table,
  title,
  singularLabel,
  pluralLabel,
  headerButtons,
  columnManager,
  globalFilter,
  tableOptions,
  downloadButtonOptions,
  className,
  ...divProps
}: {
  table: Table<RowDataModel>;
  title: string;
  singularLabel: string;
  pluralLabel: string;
  headerButtons?: ReactNode;
  columnManager?: {
    buttons?: ReactNode;
    topContent?: ReactNode;
  };
  globalFilter: {
    placeholder: string;
  };
  tableOptions: Partial<Omit<TanstackTableProps<RowDataModel>, 'table'>>;
  downloadButtonOptions?: Omit<
    TanstackTableDownloadButtonProps<RowDataModel>,
    'table' | 'singularLabel' | 'pluralLabel'
  > & { pluralLabel?: string; singularLabel?: string };
} & Omit<ComponentProps<'div'>, 'class'>) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState(
    () => (table.getState().globalFilter as string) ?? '',
  );

  // Debounce the filter update
  const debouncedSetFilter = useDebouncedCallback((value: string) => {
    table.setGlobalFilter(value);
  }, 150);

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
    <div className={clsx('card d-flex flex-column', className)} {...divProps}>
      <div className="card-header bg-primary text-white">
        <div className="d-flex align-items-center justify-content-between gap-2">
          <div>{title}</div>
          <div className="d-flex gap-2">
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
      <div className="card-body d-flex flex-row flex-wrap flex-grow-0 align-items-center gap-2">
        <div className="position-relative w-100" style={{ maxWidth: 'min(400px, 100%)' }}>
          <input
            ref={searchInputRef}
            type="text"
            className="form-control pl-ui-tanstack-table-search-input pl-ui-tanstack-table-focusable-shadow"
            aria-label={globalFilter.placeholder}
            placeholder={globalFilter.placeholder}
            value={inputValue}
            autoComplete="off"
            onInput={(e) => {
              const value = e.currentTarget.value;
              setInputValue(value);
              debouncedSetFilter(value);
            }}
          />
          {inputValue && (
            <OverlayTrigger overlay={<Tooltip>Clear search</Tooltip>}>
              <button
                type="button"
                className="btn btn-floating-icon"
                aria-label="Clear search"
                onClick={() => {
                  setInputValue('');
                  debouncedSetFilter.cancel();
                  table.setGlobalFilter('');
                }}
              >
                <i className="bi bi-x-circle-fill" aria-hidden="true" />
              </button>
            </OverlayTrigger>
          )}
        </div>
        <div className="d-flex flex-wrap flex-row align-items-center gap-2">
          <ColumnManager table={table} topContent={columnManager?.topContent} />
          {columnManager?.buttons}
        </div>
        <div className="ms-auto text-muted text-nowrap">
          Showing {displayedCount} of {totalCount} {totalCount === 1 ? singularLabel : pluralLabel}
        </div>
      </div>
      <div className="flex-grow-1">
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
  children: ReactNode;
}) {
  return (
    <div className="d-flex flex-column justify-content-center align-items-center text-muted">
      <i className={clsx('bi', iconName, 'display-4 mb-2')} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
