import { type Header, type SortDirection, type Table, flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { type JSX, type ThHTMLAttributes, useEffect, useRef } from 'preact/compat';

import type { StudentRow } from '../instructorStudents.shared.js';

function SortIcon({ sortMethod }: { sortMethod: false | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i class="bi bi-sort-up-alt" aria-hidden="true"></i>;
  } else if (sortMethod === 'desc') {
    return <i class="bi bi-sort-down" aria-hidden="true"></i>;
  } else {
    return <i class="bi bi-arrow-down-up opacity-75 text-muted" aria-hidden="true"></i>;
  }
}

function ResizeHandle({
  header,
  setColumnSizing,
}: {
  header: Header<StudentRow, unknown>;
  setColumnSizing: Table<StudentRow>['setColumnSizing'];
}) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const currentSize = header.getSize();
      const increment = e.shiftKey ? 20 : 5; // Larger increment with Shift key
      const newSize =
        e.key === 'ArrowLeft'
          ? Math.max(header.column.columnDef.minSize ?? 0, currentSize - increment) // Minimum width of 50px
          : Math.min(header.column.columnDef.maxSize ?? 0, currentSize + increment); // Maximum width of 800px

      // Use the table's setColumnSizing method to update column size
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
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="separator"
        aria-label={`Resize ${columnName} column`}
        aria-description="Use left and right arrow keys to resize, shift for larger increments, or home to reset."
        aria-orientation="vertical"
        class="h-100"
        style={{
          background: header.column.getIsResizing() ? 'var(--bs-primary)' : 'var(--bs-gray-400)',
          cursor: 'col-resize',
          transition: 'background-color 0.2s',
        }}
      />
    </div>
  );
}

export function StudentsTable({ table }: { table: Table<StudentRow> }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const rows = [...table.getTopRows(), ...table.getCenterRows()];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });

  // Handle keyboard navigation for table cells
  const handleTableKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const row = target.closest('tr');
    if (!row || !tableRef.current) return;

    const allRows = Array.from(tableRef.current.querySelectorAll('tr'));
    const currentIndex = allRows.indexOf(row);
    if (currentIndex === -1) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        allRows[currentIndex + 1]?.focus();
        break;
      }

      case 'ArrowUp': {
        e.preventDefault();
        allRows[currentIndex - 1]?.focus();
        break;
      }
    }
  };

  const virtualRows = rowVirtualizer.getVirtualItems();
  const [before, after] =
    virtualRows.length > 0
      ? [
          notUndefined(virtualRows[0]).start - rowVirtualizer.options.scrollMargin,
          rowVirtualizer.getTotalSize() - notUndefined(virtualRows[virtualRows.length - 1]).end,
        ]
      : [0, 0];
  const headerGroups = table.getHeaderGroups();
  const isTableResizing = () => {
    return headerGroups.some((headerGroup) =>
      headerGroup.headers.some((header) => header.column.getIsResizing()),
    );
  };
  const lastColumnId = table.getAllLeafColumns()[table.getAllLeafColumns().length - 1].id;

  const tableRect = tableRef.current?.getBoundingClientRect();

  useEffect(() => {
    document.body.classList.toggle('no-user-select', isTableResizing());
  }, [isTableResizing()]);

  // Helper function to get aria-sort value
  const getAriaSort = (
    sortDirection: false | SortDirection,
  ): ThHTMLAttributes<HTMLTableCellElement>['aria-sort'] => {
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
        aria-label="Students table"
      >
        <div
          ref={tableRef}
          id="foo"
          style={{
            position: 'relative',
            width: `max(${table.getTotalSize()}px, 100%)`,
          }}
        >
          <table
            class="table table-hover mb-0 border border-top-0"
            style={{ tableLayout: 'fixed' }}
            onKeyDown={handleTableKeyDown}
          >
            <thead>
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, index) => {
                    const isPinned = header.column.getIsPinned();
                    const sortDirection = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    const columnName =
                      typeof header.column.columnDef.header === 'string'
                        ? header.column.columnDef.header
                        : header.column.id;

                    const style: JSX.CSSProperties = {
                      // If the cell is the last column, use whichever is larger:
                      // 1. The remaining space
                      // 2. The column width
                      width:
                        header.column.id === lastColumnId
                          ? `max(100%, ${header.getSize()}px)`
                          : header.getSize(),
                      position: 'sticky',
                      top: 0,
                      // 2 - pinned header columns
                      // 1 - unpinned header row
                      // 0 - table body
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
                        tabIndex={canSort ? 0 : undefined}
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
                        <div
                          class="text-nowrap"
                          style={{
                            cursor: canSort ? 'pointer' : 'default',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          role={canSort ? 'button' : undefined}
                          aria-label={
                            canSort
                              ? `${columnName} column, current sort is ${getAriaSort(sortDirection)}`
                              : `${columnName} column, not sortable`
                          }
                          aria-description={
                            canSort
                              ? `Use Enter to toggle the sort direction of the ${columnName} column.`
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
                        </div>
                        {/* If the table is narrower than its container, don't show the resize handle for the last column. */}
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
                <tr aria-hidden="true">
                  <td colSpan={headerGroups[0].headers.length} style={{ height: before }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    style={{
                      height: `${virtualRow.size}px`,
                    }}
                  >
                    {row.getLeftVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        class="bg-light"
                        style={{
                          width:
                            cell.column.id === lastColumnId
                              ? `max(100%, ${cell.column.getSize()}px)`
                              : cell.column.getSize(),
                          position: 'sticky',
                          left: cell.column.getStart(),
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {row.getCenterVisibleCells().map((cell) => {
                      return (
                        <td
                          key={cell.id}
                          style={{
                            width:
                              cell.column.id === lastColumnId
                                ? `max(100%, ${cell.column.getSize()}px)`
                                : cell.column.getSize(),
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {after > 0 && (
                <tr aria-hidden="true">
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
            <i class="bi bi-eye-slash fa-2x mb-2" aria-hidden="true"></i>
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
          <i class="fa fa-search fa-2x mb-2" aria-hidden="true"></i>
          <p class="mb-0">No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}
