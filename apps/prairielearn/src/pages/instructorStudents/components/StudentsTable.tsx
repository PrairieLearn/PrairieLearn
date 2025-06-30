import { type Header, type SortDirection, type Table, flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { type JSX, useEffect, useRef } from 'preact/compat';

import type { StudentRow } from '../instructorStudents.shared.js';

function SortIcon({ sortMethod }: { sortMethod: null | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i class="bi bi-sort-up-alt"></i>;
  } else if (sortMethod === 'desc') {
    return <i class="bi bi-sort-down"></i>;
  } else {
    return <i class="bi bi-arrow-down-up opacity-75 text-muted"></i>;
  }
}

function ResizeHandle({ header }: { header: Header<StudentRow, unknown> }) {
  return (
    <div class="py-1 h-100" style={{ position: 'absolute', right: 0, top: 0, width: '4px' }}>
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
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

  const rows = [...table.getTopRows(), ...table.getCenterRows()];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });

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

  useEffect(() => {
    document.body.classList.toggle('no-user-select', isTableResizing());
  }, [isTableResizing()]);

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
          style={{
            position: 'relative',
            width: `max(${table.getTotalSize()}px, 100%)`,
          }}
        >
          <table
            class="table table-hover mb-0 border border-top-0"
            style={{ tableLayout: 'fixed' }}
          >
            <thead>
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isPinned = header.column.getIsPinned();
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
                        style={{ ...style }}
                      >
                        <div
                          class="text-nowrap"
                          style={{
                            cursor: header.column.getCanSort() ? 'pointer' : 'default',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          onClick={
                            header.column.getCanSort()
                              ? header.column.getToggleSortingHandler()
                              : undefined
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span class="ms-2">
                              <SortIcon sortMethod={header.column.getIsSorted() || null} />
                            </span>
                          )}
                        </div>
                        <ResizeHandle header={header} />
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {before > 0 && (
                <tr>
                  <td colSpan={headerGroups[0].headers.length} style={{ height: before }} />
                </tr>
              )}
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
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
                <tr>
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
        >
          <i class="fa fa-search fa-2x mb-2"></i>
          <p class="mb-0">No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}
