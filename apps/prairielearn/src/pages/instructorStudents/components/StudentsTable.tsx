import { type Header, type SortDirection, type Table, flexRender } from '@tanstack/react-table';
import { notUndefined, useVirtualizer } from '@tanstack/react-virtual';
import { type JSX, useRef } from 'preact/compat';

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
    <div
      onMouseDown={header.getResizeHandler()}
      onTouchStart={header.getResizeHandler()}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: '4px',
        background: header.column.getIsResizing() ? 'var(--bs-primary)' : 'transparent',
        cursor: 'col-resize',
        userSelect: 'none',
        touchAction: 'none',
        transition: 'background-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!header.column.getIsResizing()) {
          e.currentTarget.style.background = 'var(--bs-gray-400)';
        }
      }}
      onMouseLeave={(e) => {
        if (!header.column.getIsResizing()) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    />
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
  const lastColumnId = table.getAllLeafColumns()[table.getAllLeafColumns().length - 1].id;
  const allButLastColumnWidth = headerGroups.reduce((acc, headerGroup) => {
    return (
      acc +
      headerGroup.headers.reduce((acc, header) => {
        if (header.column.id === lastColumnId) {
          return acc;
        }
        return acc + header.getSize();
      }, 0)
    );
  }, 0);

  return (
    <div style={{ height: '70vh' }} class="d-flex border flex-column justify-content-start">
      <div
        ref={parentRef}
        style={{
          overflow: 'auto',
          overflowAnchor: 'none',
          flexGrow: table.getRowModel().rows.length === 0 ? 0 : 1,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: table.getTotalSize(),
          }}
        >
          <table class="table table-striped table-hover" style={{ tableLayout: 'fixed' }}>
            <thead>
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isPinned = header.column.getIsPinned();
                    const style: JSX.CSSProperties = {
                      width:
                        /*
                        If the cell is the last column, use whichever is larger:
                          1. The remaining space
                          2. The column width
                        
                        Widths:
                          2px - table border
                          32px - card body padding
                          24px - card padding
                        */
                        header.column.id === lastColumnId
                          ? `max(calc(100vw - 32px - 24px - 2px - ${allButLastColumnWidth}px), ${header.getSize()}px)`
                          : header.getSize(),
                      position: 'sticky',
                      top: 0,
                      background: 'var(--bs-body-bg)',
                      /*
                      zIndex:
                        2 - pinned header columns
                        1 - unpinned header row
                        0 - table body
                      */
                      zIndex: isPinned === 'left' ? 2 : 1,
                      left: isPinned === 'left' ? header.getStart() : undefined,
                    };

                    return (
                      <th key={header.id} style={style}>
                        <div
                          class="text-nowrap"
                          style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
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
                        style={{
                          width:
                            cell.column.id === lastColumnId
                              ? `max(calc(100vw - 32px - 24px - 2px - ${allButLastColumnWidth}px), ${cell.column.getSize()}px)`
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
                                ? `max(calc(100vw - 32px - 24px - 2px - ${allButLastColumnWidth}px), ${cell.column.getSize()}px)`
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

      {table.getRowModel().rows.length === 0 && (
        <div class="d-flex flex-column justify-content-center align-items-center text-muted py-4 flex-grow-1">
          <i class="fa fa-search fa-2x mb-2"></i>
          <p>No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}
