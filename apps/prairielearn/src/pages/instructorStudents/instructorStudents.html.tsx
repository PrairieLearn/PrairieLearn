import { faSort, faSortDown, faSortUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// eslint-disable-next-line import-x/order
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

import { useEffect, useMemo, useState } from 'preact/compat';

import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type Course, type CourseInstance, type User } from '../../lib/db-types.js';

import { StudentDataViewMissing } from './components/StudentDataViewMissing.js';
// import { StudentsTable } from './components/StudentsTable.js'; // Not used in this version
import { type StudentRow } from './instructorStudents.types.js';

// --- StudentsCard component (was StudentsTable) ---

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

// Download functions (reuse from above)
function downloadStudentsCSV(students: StudentRow[], { filename }: { filename: string }): void {
  const headers = ['UID', 'Name', 'Email', 'Enrolled At'];
  const rows = students.map((student) => [
    student.uid,
    student.name ?? '',
    student.email ?? '',
    student.created_at
      ? new Date(student.created_at).toISOString().replace('T', ' ').split('.')[0]
      : '',
  ]);
  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((field) =>
          typeof field === 'string' && /[",\n]/.test(field)
            ? `"${field.replace(/"/g, '""')}"`
            : (field ?? ''),
        )
        .join(','),
    )
    .join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadStudentsJSON(students: StudentRow[], { filename }: { filename: string }): void {
  const jsonContent = JSON.stringify(students, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StudentsCard({
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

  // Update URL when search or sorting changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    // Update search param
    if (globalFilter) {
      params.set('search', globalFilter);
    } else {
      params.delete('search');
    }
    // Update sort params
    if (sorting.length > 0) {
      params.set('sortBy', sorting[0].id);
      params.set('sortOrder', sorting[0].desc ? 'desc' : 'asc');
    } else {
      params.delete('sortBy');
      params.delete('sortOrder');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl);
  }, [globalFilter, sorting]);

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
                      onClick={() => downloadStudentsCSV(students, { filename: 'students.csv' })}
                    >
                      <i class="bi bi-filetype-csv"></i> All Students
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item"
                      type="button"
                      onClick={() => downloadStudentsJSON(students, { filename: 'students.csv' })}
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
                          { filename: 'students-current-view.csv' },
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
                        downloadStudentsJSON(
                          table.getFilteredRowModel().rows.map((row) => row.original),
                          { filename: 'students-current-view.json' },
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

export interface ResLocals {
  authz_data: {
    has_course_instance_permission_edit: boolean;
    has_course_instance_permission_view: boolean;
    has_course_permission_own: boolean;
  };
  course_instance: CourseInstance;
  course: Course;
  urlPrefix: string;
}

interface InstructorStudentsContentProps {
  resLocals: ResLocals;
  courseOwners: User[];
  students: StudentRow[];
  initialGlobalFilterValue: string;
  initialSortingValue: SortingState;
}

export const InstructorStudents = ({
  resLocals,
  courseOwners,
  students,
  initialGlobalFilterValue,
  initialSortingValue,
}: InstructorStudentsContentProps) => {
  const { authz_data, urlPrefix } = resLocals;

  return (
    <>
      <div
        // TODO: After #12197 use the component directly
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{
          __html: CourseInstanceSyncErrorsAndWarnings({
            authz_data,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix,
          }).toString(),
        }}
      />
      {!authz_data.has_course_instance_permission_view && courseOwners ? (
        <StudentDataViewMissing
          courseOwners={courseOwners}
          hasCoursePermissionOwn={authz_data.has_course_permission_own}
          urlPrefix={urlPrefix}
        />
      ) : (
        <StudentsCard
          students={students ?? []}
          initialGlobalFilterValue={initialGlobalFilterValue}
          initialSortingValue={initialSortingValue}
        />
      )}
    </>
  );
};
