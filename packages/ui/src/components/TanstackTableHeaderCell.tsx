import { flexRender } from '@tanstack/react-table';
import type { Header, SortDirection, Table } from '@tanstack/table-core';
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

function SortIcon({ sortMethod }: { sortMethod: false | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i className="bi bi-sort-up-alt" aria-hidden="true" />;
  } else if (sortMethod === 'desc') {
    return <i className="bi bi-sort-down" aria-hidden="true" />;
  } else {
    return <i className="bi bi-arrow-down-up opacity-75 text-muted" aria-hidden="true" />;
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <div className="py-1 h-100" style={{ position: 'absolute', right: 0, top: 0, width: '4px' }}>
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
        className="h-100"
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

export function TanstackTableHeaderCell<RowDataModel>({
  header,
  filters,
  table,
  handleResizeEnd,
  isPinned,
  measurementMode = false,
}: {
  header: Header<RowDataModel, unknown>;
  filters: Record<string, (props: { header: Header<RowDataModel, unknown> }) => ReactNode>;
  table: Table<RowDataModel>;
  handleResizeEnd?: () => void;
  isPinned: 'left' | false;
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
    position: isPinned === 'left' ? 'sticky' : 'relative',
    top: 0,
    zIndex: isPinned === 'left' ? 2 : 1,
    left: isPinned === 'left' ? header.getStart() : undefined,
  };

  const isNormalColumn = canSort || canFilter;

  return (
    <th
      key={header.id}
      data-column-id={header.column.id}
      className={clsx(isPinned === 'left' && 'bg-light')}
      style={style}
      aria-sort={canSort ? getAriaSort(sortDirection) : undefined}
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
        <ResizeHandle
          header={header}
          setColumnSizing={table.setColumnSizing}
          onResizeEnd={handleResizeEnd}
        />
      )}
    </th>
  );
}
