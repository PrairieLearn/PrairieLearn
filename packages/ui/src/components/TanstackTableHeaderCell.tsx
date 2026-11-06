import { type RowData, type SortDirection, flexRender } from '@tanstack/react-table';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

import type { TanstackTableHeader, TanstackTableInstance } from '../tanstack-table.js';

function SortIcon({ sortMethod }: { sortMethod: false | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i className="bi bi-sort-up-alt" aria-hidden="true" />;
  } else if (sortMethod === 'desc') {
    return <i className="bi bi-sort-down" aria-hidden="true" />;
  } else {
    return <i className="bi bi-arrow-down-up opacity-75 text-muted" aria-hidden="true" />;
  }
}

function ResizeHandle<RowDataModel extends RowData>({
  header,
  table,
  onResizeEnd,
}: {
  header: TanstackTableHeader<RowDataModel>;
  table: TanstackTableInstance<RowDataModel>;
  onResizeEnd?: () => void;
}) {
  const minSize = header.column.columnDef.minSize ?? 0;
  const maxSize = header.column.columnDef.maxSize ?? 0;
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const currentSize = header.getSize();
      const increment = e.shiftKey ? 20 : 5; // Larger increment with Shift key
      const newSize =
        e.key === 'ArrowLeft'
          ? Math.max(minSize, currentSize - increment)
          : Math.min(maxSize, currentSize + increment);

      table.setColumnSizing((prevSizing) => ({
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
    <div
      className="py-1 h-100"
      style={{ position: 'absolute', insetInlineEnd: 0, top: 0, width: '16px' }}
    >
      <div
        role="separator"
        aria-label={`Resize '${columnName}' column`}
        aria-valuetext={`${header.getSize()}px`}
        aria-orientation="vertical"
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        aria-valuenow={header.getSize()}
        tabIndex={0}
        className="h-100 pl-ui-tanstack-table-resize-handle"
        data-resizing={header.column.getIsResizing() || undefined}
        onMouseDown={header.getResizeHandler()}
        onMouseUp={onResizeEnd}
        onTouchStart={header.getResizeHandler()}
        onTouchEnd={onResizeEnd}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

/**
 * Helper function to get aria-sort value
 */
function getAriaSort(sortDirection: false | SortDirection) {
  switch (sortDirection) {
    case 'asc':
      return 'ascending';
    case 'desc':
      return 'descending';
    default:
      return 'none';
  }
}

export function TanstackTableHeaderCell<RowDataModel extends RowData>({
  header,
  filters,
  table,
  handleResizeEnd,
  isPinned,
  measurementMode = false,
}: {
  header: TanstackTableHeader<RowDataModel>;
  filters: Record<string, (props: { header: TanstackTableHeader<RowDataModel> }) => ReactNode>;
  table: TanstackTableInstance<RowDataModel>;
  handleResizeEnd?: () => void;
  isPinned: 'start' | false;
  measurementMode?: boolean;
}) {
  const sortDirection = header.column.getIsSorted();
  const canSort = header.column.getCanSort();
  const canFilter = header.column.getCanFilter();
  const columnName =
    header.column.columnDef.meta?.label ??
    (typeof header.column.columnDef.header === 'string'
      ? header.column.columnDef.header
      : header.column.id);

  // In measurement mode, we don't want to set the size of the header from tanstack.
  const headerSize = measurementMode ? undefined : header.getSize();
  const style: CSSProperties = {
    display: 'flex',
    width: headerSize,
    minWidth: 0,
    maxWidth: headerSize,
    flexShrink: 0,
    paddingInlineEnd: header.column.getCanResize() ? '16px' : undefined,
    position: isPinned === 'start' ? 'sticky' : 'relative',
    top: 0,
    zIndex: isPinned === 'start' ? 2 : 1,
    insetInlineStart: isPinned === 'start' ? header.getStart() : undefined,
  };

  const isNormalColumn = canSort || canFilter;

  return (
    <th
      key={header.id}
      data-column-id={header.column.id}
      className={clsx(isPinned === 'start' && 'bg-light')}
      style={style}
      aria-sort={canSort ? getAriaSort(sortDirection) : undefined}
      // The table uses CSS grid layout, which drops implicit table semantics, so the role is required.
      // oxlint-disable-next-line jsx-a11y/no-redundant-roles
      role="columnheader"
    >
      <div
        className={clsx(
          'd-flex align-items-center flex-grow-1',
          isNormalColumn ? 'justify-content-between' : 'justify-content-center',
        )}
        style={{
          minWidth: 0,
        }}
      >
        <div
          className={clsx(
            'text-nowrap text-start',
            // e.g. checkboxes
            !isNormalColumn && 'd-flex align-items-center justify-content-center',
          )}
          style={{
            minWidth: 0,
            flex: '1 1 0%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background: 'transparent',
            border: 'none',
          }}
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
          {canSort && (
            <span className="visually-hidden">, {getAriaSort(sortDirection)}, click to sort</span>
          )}
        </div>

        {(canSort || canFilter) && (
          <div className="d-flex align-items-center" style={{ flexShrink: 0 }}>
            {canSort && (
              <button
                type="button"
                className="btn btn-link text-muted p-0"
                aria-label={`Sort ${columnName.toLowerCase()}, current sort is ${getAriaSort(sortDirection)}`}
                title={`Sort ${columnName.toLowerCase()}`}
                onClick={header.column.getToggleSortingHandler()}
              >
                <SortIcon sortMethod={sortDirection} />
              </button>
            )}
            {canFilter && filters[header.column.id]?.({ header })}
          </div>
        )}
      </div>
      {header.column.getCanResize() && (
        <ResizeHandle header={header} table={table} onResizeEnd={handleResizeEnd} />
      )}
    </th>
  );
}
