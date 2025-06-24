import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type VisibilityState as ColumnVisibilityState,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'preact/compat';

import { downloadAsCSV, downloadAsJSON } from '../../../lib/client/downloads.js';
import { type StudentRow, parseAsSortingState } from '../instructorStudents.shared.js';

import { ColumnManager } from './ColumnManager.js';
import { StudentsTable } from './StudentsTable.js';

function downloadStudentsCSV(students: StudentRow[], filename: string): void {
  const rows = students.map((student) => [
    student.uid,
    student.name,
    student.email,
    student.created_at
      ? new Date(student.created_at).toISOString().replace('T', ' ').split('.')[0]
      : '',
  ]);
  downloadAsCSV(['UID', 'Name', 'Email', 'Enrolled At'], rows, filename);
}

const columnHelper = createColumnHelper<StudentRow>();

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [];

export function StudentsCard({ students }: { students: StudentRow[] }) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({
    left: [],
    right: [],
  });

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      columnHelper.accessor('uid', {
        header: 'UID',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('created_at', {
        header: 'Enrolled At',
        cell: (info) => {
          const date = new Date(info.getValue());
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: students,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.uid,
    state: {
      sorting: sorting ?? undefined,
      columnFilters,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    defaultColumn: {
      minSize: 150,
      size: 300,
      maxSize: 500,
      enableSorting: true,
      enableHiding: true,
      enablePinning: true,
    },
  });

  // Sync state to URL
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <div className="d-flex justify-content-between align-items-center">
          <div>Students</div>
        </div>
      </div>
      <div className="card-body">
        <div className="mb-3">
          <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-md-center">
            <div className="d-flex gap-2 col-12 col-lg-5">
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
              <ColumnManager table={table} />
            </div>
            <div className="d-flex flex-column flex-md-row justify-content-md-between align-items-start align-items-md-center">
              <div className="text-muted mt-2 mt-md-0 me-md-2">
                Showing {table.getRowModel().rows.length} of {students.length} students
              </div>
              <div className="btn-group">
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm dropdown-toggle"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <i className="px-2 fa fa-download" aria-hidden="true"></i>
                  Download
                </button>
                <ul className="dropdown-menu">
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() => downloadAsJSON(students, 'students.csv')}
                    >
                      All Students as CSV
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() => downloadAsJSON(students, 'students.csv')}
                    >
                      All Students as JSON
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() =>
                        downloadStudentsCSV(
                          table.getFilteredRowModel().rows.map((row) => row.original),
                          'students-current-view.csv',
                        )
                      }
                    >
                      Filtered Students as CSV
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() =>
                        downloadAsJSON(
                          table.getFilteredRowModel().rows.map((row) => row.original),
                          'students-current-view.json',
                        )
                      }
                    >
                      Filtered Students as JSON
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <StudentsTable table={table} />
      </div>
    </div>
  );
}
