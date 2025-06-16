import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { type StudentRow } from './instructorStudents.types.js';

interface StudentsTableProps {
  students: StudentRow[];
}

const columnHelper = createColumnHelper<StudentRow>();

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
      columnHelper.accessor('uin', {
        header: 'UIN',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('user_name', {
        header: 'Name',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('role', {
        header: () => (
          <span>
            Role{' '}
            <button
              type="button"
              className="btn btn-link btn-sm p-0 ms-1"
              data-bs-toggle="modal"
              data-bs-target="#role-help"
            >
              <i className="fa fa-question-circle" aria-hidden="true"></i>
            </button>
          </span>
        ),
        cell: (info) => {
          const role = info.getValue();
          const badgeClass =
            role === 'Staff' ? 'bg-warning' : role === 'Student' ? 'bg-success' : 'bg-secondary';
          return <span className={`badge ${badgeClass}`}>{role}</span>;
        },
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
        <div className="row">
          <div className="col-md-6">
            <label htmlFor="search-input" className="form-label">
              Search students:
            </label>
            <input
              type="text"
              id="search-input"
              className="form-control"
              placeholder="Search by UID, name, email..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="col-md-6 d-flex align-items-end">
            <div className="text-muted">
              Showing {table.getRowModel().rows.length} of {students.length} students
            </div>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead className="table-dark">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="ms-1">
                        {header.column.getIsSorted() === 'asc' ? (
                          <i className="fa fa-sort-up"></i>
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <i className="fa fa-sort-down"></i>
                        ) : (
                          <i className="fa fa-sort text-muted"></i>
                        )}
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
