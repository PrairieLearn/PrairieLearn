import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type VisibilityState as ColumnVisibilityState,
  type RowPinningState,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'preact/compat';

import { downloadAsCSV, downloadAsJSON } from '../../../lib/client/downloads.js';
import { useURLSync } from '../../../lib/client/useURLSync.js';
import type { StudentRow } from '../instructorStudents.types.js';

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

export function StudentsCard({
  students,
  initialGlobalFilterValue,
  initialSortingValue,
}: {
  students: StudentRow[];
  initialGlobalFilterValue: string;
  initialSortingValue: SortingState;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSortingValue);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState(initialGlobalFilterValue);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowPinning, setRowPinning] = useState<RowPinningState>({ top: [], bottom: [] });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      columnHelper.display({
        id: 'pin',
        cell: ({ row }) => (
          <div className="text-center">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => row.pin(row.getIsPinned() ? false : 'top', true, true)}
              title={row.getIsPinned() ? 'Unpin row' : 'Pin row'}
            >
              <i
                className={`bi ${
                  row.getIsPinned() ? 'bi-pin-angle-fill text-primary' : 'bi-pin-angle'
                }`}
              />
            </button>
          </div>
        ),
        size: 32,
        enableResizing: false,
        enableHiding: false,
      }),
      columnHelper.accessor('uid', {
        header: 'UID',
        cell: (info) => info.getValue(),
        enableSorting: true,
        size: 200,
        enableHiding: true,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
        size: 200,
        enableHiding: true,
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
        size: 250,
        enableHiding: true,
      }),
      columnHelper.accessor('created_at', {
        header: 'Enrolled At',
        cell: (info) => {
          const date = new Date(info.getValue());
          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },
        enableSorting: true,
        size: 200,
        enableHiding: true,
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
      sorting,
      columnFilters,
      globalFilter,
      columnSizing,
      rowPinning,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onRowPinningChange: setRowPinning,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Sync state to URL
  useURLSync(globalFilter, sorting);

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
              <div className="btn-group">
                <button
                  type="button"
                  className="btn btn-outline-secondary dropdown-toggle text-nowrap"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <i className="bi bi-view-list me-2" />
                  View
                </button>
                <div className="dropdown-menu dropdown-menu-arrow">
                  <div className="px-2 py-1">
                    <label className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={table.getIsAllColumnsVisible()}
                        onChange={table.getToggleAllColumnsVisibilityHandler()}
                      />
                      <span className="form-check-label">Toggle all</span>
                    </label>
                  </div>
                  <div className="dropdown-divider"></div>
                  {table.getAllLeafColumns().map((column) => {
                    if (!column.getCanHide()) return null;
                    const header =
                      typeof column.columnDef.header === 'string'
                        ? column.columnDef.header
                        : column.id;
                    return (
                      <div key={column.id} className="px-2 py-1">
                        <label className="form-check">
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={column.getIsVisible()}
                            onChange={column.getToggleVisibilityHandler()}
                          />
                          <span className="form-check-label">{header}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                      <i class="bi bi-filetype-csv"></i> All Students
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() => downloadAsJSON(students, 'students.csv')}
                    >
                      <i class="bi bi-filetype-json"></i> All Students
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
                      <i class="bi bi-filetype-csv"></i> Filtered Students
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
                      <i class="bi bi-filetype-json"></i> Filtered Students
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
