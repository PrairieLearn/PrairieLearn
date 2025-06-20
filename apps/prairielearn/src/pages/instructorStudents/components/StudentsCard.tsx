import { faSort, faSortDown, faSortUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortDirection,
  type SortingState,
  type Table,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState } from 'preact/compat';

import { downloadAsCSV, downloadAsJSON } from '../../../lib/client/downloads.js';
import { useURLSync } from '../../../lib/client/useURLSync.js';
import type { StudentRow } from '../instructorStudents.types.js';

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

function SortIcon({ sortMethod }: { sortMethod: false | SortDirection }) {
  if (sortMethod === 'asc') {
    return <FontAwesomeIcon icon={faSortUp} className="fa-fw" />;
  } else if (sortMethod === 'desc') {
    return <FontAwesomeIcon icon={faSortDown} className="fa-fw" />;
  } else {
    return <FontAwesomeIcon icon={faSort} className="fa-fw opacity-75 text-muted" />;
  }
}

function StudentsTableBody({ table }: { table: Table<StudentRow> }) {
  return (
    <div className="table-responsive">
      <table className="table table-striped table-hover border">
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
                      <SortIcon sortMethod={header.column.getIsSorted()} />
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
      {table.getRowModel().rows.length === 0 && (
        <div className="d-flex flex-column align-items-center text-muted py-4">
          <i className="fa fa-search fa-2x mb-2"></i>
          <p>No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}

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

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      columnHelper.accessor('uid', {
        id: 'uid',
        header: 'UID',
        cell: (info) => info.getValue(),
        enableSorting: true,
      }),
      columnHelper.accessor('name', {
        id: 'name',
        header: 'Name',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: (info) => info.getValue() || '—',
        enableSorting: true,
      }),
      columnHelper.accessor('created_at', {
        id: 'created_at',
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

  const table = useReactTable<StudentRow>({
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
            <div className="col-12 col-md-4">
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

        <StudentsTableBody table={table} />
      </div>
    </div>
  );
}
