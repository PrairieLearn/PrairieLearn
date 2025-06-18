import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortDirection,
  type SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'preact/compat';

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

const columnHelper = createColumnHelper<StudentRow>();

function SortIcon({ isSorted }: { isSorted: false | SortDirection }) {
  if (isSorted === 'asc') {
    return <i className="bi bi-sort-up"></i>;
  } else if (isSorted === 'desc') {
    return <i className="bi bi-sort-down"></i>;
  } else {
    return <i className="bi bi-arrows-expand text-muted"></i>;
  }
}

export function StudentsTable({ students }: StudentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      columnHelper.accessor('uid', {
        header: 'UID',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('created_at', {
        header: 'Enrolled At',
        cell: (info) => {
          const date = new Date(info.getValue());
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },
        enableSorting: true,
      }),
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
  });

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

      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="text-nowrap"
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="ms-1">
                        <SortIcon isSorted={header.column.getIsSorted()} />
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
