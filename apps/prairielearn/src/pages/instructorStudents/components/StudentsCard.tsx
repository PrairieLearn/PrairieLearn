import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type VisibilityState as ColumnVisibilityState,
  type SortingState,
  type Table,
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

const DownloadButton = ({
  students,
  table,
}: {
  students: StudentRow[];
  table: Table<StudentRow>;
}) => {
  return (
    <div class="btn-group">
      <button
        type="button"
        class="btn btn-sm btn-outline-primary dropdown-toggle"
        data-bs-toggle="dropdown"
        aria-expanded="false"
      >
        <i class="px-2 fa fa-download" aria-hidden="true"></i>
        Download
      </button>
      <ul class="dropdown-menu">
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadAsJSON(students, 'students.csv')}
          >
            All Students as CSV
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
            type="button"
            onClick={() => downloadAsJSON(students, 'students.csv')}
          >
            All Students as JSON
          </button>
        </li>
        <li>
          <button
            class="dropdown-item"
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
            class="dropdown-item"
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
  );
};

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
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <div class="d-flex align-items-center">
          <div>Students</div>
        </div>
      </div>
      <div class="card-body mb-3">
        <div class="d-flex flex-row mb-2">
          <div class="col-md-6 col-xl-4 col-10 col-auto">
            <input
              type="text"
              id="search-input"
              class="form-control"
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
          <div class="col-md-6 col-xl-8 col-2 d-flex flex-row justify-content-md-between justify-content-end">
            <div class="mx-2">
              <ColumnManager table={table} />
            </div>
            <div class="d-none d-md-block">
              <DownloadButton students={students} table={table} />
            </div>
          </div>
        </div>
        <div class="d-flex flex-row justify-content-between justify-content-md-end mb-2 align-items-end">
          <div class="text-muted">
            Showing {table.getRowModel().rows.length} of {students.length} students
          </div>
          <div class="d-block d-md-none">
            <DownloadButton students={students} table={table} />
          </div>
        </div>
        <StudentsTable table={table} />
      </div>
    </div>
  );
}
