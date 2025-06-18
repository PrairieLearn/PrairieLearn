import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortDirection,
  type SortingState,
  type Table,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'preact/compat';
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window';

import type { StudentRow } from '../instructorStudents.types.js';

export interface InstructorStudentsData {
  urlPrefix: string;
  csvFilename: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  students: StudentRow[];
}

interface StudentsTableProps {
  students: StudentRow[];
}

function SortIcon({ isSorted }: { isSorted: false | SortDirection }) {
  if (isSorted === 'asc') {
    return <i className="bi bi-sort-up"></i>;
  } else if (isSorted === 'desc') {
    return <i className="bi bi-sort-down"></i>;
  } else {
    return <i className="bi bi-arrows-expand text-muted"></i>;
  }
}

function StudentsTableHeader({ table }: { table: Table<StudentRow> }) {
  // Compute gridTemplateColumns: all but last column use px, last uses 1fr
  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplateColumns = headers
    .map((header, i) =>
      i === headers.length - 1 ? '1fr' : header.getSize ? `${header.getSize()}px` : '1fr',
    )
    .join(' ');
  const columnSizingInfo = table.getState().columnSizingInfo;
  console.log(columnSizingInfo);
  return (
    <div style={{ position: 'relative' }}>
      <div
        className="d-grid bg-light fw-bold border-bottom"
        style={{ gridTemplateColumns }}
        role="row"
      >
        {headers.map((header, i) => (
          <div
            key={header.id}
            className={`text-nowrap px-2 py-2 position-relative ${
              i !== headers.length - 1 ? 'border-end' : ''
            }`}
            style={{
              cursor: header.column.getCanSort() ? 'pointer' : 'default',
              userSelect: 'none',
              width:
                i === headers.length - 1
                  ? '1fr'
                  : header.getSize
                    ? `${header.getSize()}px`
                    : undefined,
            }}
            onClick={header.column.getToggleSortingHandler()}
            role="columnheader"
          >
            {header.isPlaceholder
              ? null
              : flexRender(header.column.columnDef.header, header.getContext())}
            {header.column.getCanSort() && (
              <span className="ms-1">
                <SortIcon isSorted={header.column.getIsSorted()} />
              </span>
            )}
            {header.column.getCanResize() && (
              <div
                style={{
                  position: 'absolute',
                  right: -4,
                  top: 0,
                  width: 8,
                  height: '100%',
                  cursor: 'col-resize',
                  zIndex: 2,
                  userSelect: 'none',
                }}
                onMouseDown={header.getResizeHandler()}
                onTouchStart={header.getResizeHandler()}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface VirtualizedRowProps extends ListChildComponentProps {
  table: Table<StudentRow>;
  height: number;
}
function VirtualizedRow({ index, style, table, height }: VirtualizedRowProps) {
  const row = table.getRowModel().rows[index];
  // Compute gridTemplateColumns: all but last column use px, last uses 1fr
  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplateColumns = headers
    .map((header, i) =>
      i === headers.length - 1 ? '1fr' : header.getSize ? `${header.getSize()}px` : '1fr',
    )
    .join(' ');
  return (
    <div
      className="d-grid border-bottom align-items-center"
      style={{ ...style, gridTemplateColumns, height }}
      role="row"
      key={row.id}
    >
      {row.getVisibleCells().map((cell: any, i: number) => (
        <div
          className={`px-2 py-2 overflow-auto text-nowrap h-100 d-flex align-items-center flex-row ${
            i !== headers.length - 1 ? 'border-end' : ''
          }`}
          role="cell"
          key={cell.id}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
}

export function StudentsTable({ students }: StudentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      {
        accessorKey: 'uid',
        header: 'UID',
        enableSorting: true,
        size: 200,
        minSize: 100,
        maxSize: 600,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        size: 200,
        minSize: 100,
        maxSize: 600,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: true,
        size: 250,
        minSize: 150,
        maxSize: 800,
      },
      {
        accessorKey: 'created_at',
        header: 'Enrolled At',
        enableSorting: true,
        size: 220,
        minSize: 120,
        maxSize: 400,
        enableResizing: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: students,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  const rowHeight = 44;
  const [listHeight, setListHeight] = useState(400);
  // If the window is resized, update the list height
  useEffect(() => {
    function updateHeight() {
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setListHeight(Math.max(300, window.innerHeight - 300));
    }
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <div>
      <div className="mb-3">
        <div className="d-flex flex-row justify-content-between align-items-center">
          <div className="col-md-4">
            <input
              type="text"
              id="search-input"
              className="form-control"
              placeholder="Search by UID, name, email..."
              value={globalFilter}
              onInput={(e) => {
                if (!(e.target instanceof HTMLInputElement)) {
                  return;
                }
                setGlobalFilter(e.target.value);
              }}
            />
          </div>
          <div className="text-muted">
            Showing {table.getRowModel().rows.length} of {students.length} students
          </div>
        </div>
      </div>

      <div className="border" style={{ maxHeight: listHeight + 60 }}>
        <StudentsTableHeader table={table} />
        <div style={{ height: listHeight, overflow: 'auto' }} role="rowgroup">
          <List
            height={listHeight}
            itemCount={table.getRowModel().rows.length}
            itemSize={rowHeight}
            width={'100%'}
          >
            {
              ((props: ListChildComponentProps) => (
                <VirtualizedRow {...props} table={table} height={rowHeight} />
              )) as any
            }
          </List>
        </div>
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div className="text-center text-muted py-4">
          <i className="fa fa-search fa-2x mb-2"></i>
          <p>No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}
