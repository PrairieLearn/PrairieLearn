import { type SortDirection, type Table, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'preact/compat';

import type { StudentRow } from '../instructorStudents.types.js';

function SortIcon({ sortMethod }: { sortMethod: null | SortDirection }) {
  if (sortMethod === 'asc') {
    return <i className="bi bi-sort-up"></i>;
  } else if (sortMethod === 'desc') {
    return <i className="bi bi-sort-down"></i>;
  } else {
    return <i className="bi bi-arrows-expand opacity-75 text-muted"></i>;
  }
}

export function StudentsTable({ table }: { table: Table<StudentRow> }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  return (
    <>
      <div
        ref={parentRef}
        className="table-responsive"
        style={{ maxHeight: '600px', overflowY: 'auto', color: 'red' }}
      >
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          <table className="table table-striped table-hover border">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-nowrap"
                      style={{
                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                        width: header.getSize(),
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="ms-1">
                          <SortIcon sortMethod={header.column.getIsSorted() || null} />
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {virtualRows.map((virtualRow, index) => {
                const row = rows[virtualRow.index];
                return (
                  <tr
                    key={row.id}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start - index * virtualRow.size}px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} style={{ width: cell.column.getSize() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div className="d-flex flex-column align-items-center text-muted py-4">
          <i className="fa fa-search fa-2x mb-2"></i>
          <p>No students found matching your search criteria.</p>
        </div>
      )}
    </>
  );
}
