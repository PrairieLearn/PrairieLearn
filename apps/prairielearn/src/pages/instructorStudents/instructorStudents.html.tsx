import {
  type AccessorKeyColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'preact/compat';

import { formatDate, formatTz } from '@prairielearn/formatter';

import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../lib/client/nuqs.js';
import type { StaffCourseInstanceContext } from '../../lib/client/page-context.js';

import { ColumnManager } from './components/ColumnManager.js';
import { DownloadButton } from './components/DownloadButton.js';
import { StudentsTable } from './components/StudentsTable.js';
import { type StudentRow } from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [];

const columnHelper = createColumnHelper<StudentRow>();

interface StudentsCardProps {
  students: StudentRow[];
  timezone: string;
  courseInstance: StaffCourseInstanceContext['course_instance'];
  course: StaffCourseInstanceContext['course'];
}

function StudentsCard({ students, timezone, courseInstance, course }: StudentsCardProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault({ left: ['user_uid'], right: [] }),
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus the search input when Ctrl+F is pressed
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        if (searchInputRef.current && searchInputRef.current !== document.activeElement) {
          searchInputRef.current.focus();
          event.preventDefault();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const columns = useMemo<AccessorKeyColumnDef<StudentRow, any>[]>(
    () => [
      columnHelper.accessor('user.uid', {
        header: 'UID',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor('user.name', {
        header: 'Name',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('user.email', {
        header: 'Email',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor('enrollment.created_at', {
        header: `Enrolled on (${formatTz(timezone)})`,
        cell: (info) => {
          const date = new Date(info.getValue());
          return (
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDate(date, timezone, {
                includeTz: false,
              })}
            </div>
          );
        },
      }),
    ],
    [],
  );

  const allColumnIds = columns
    .filter((col) => col.accessorKey)
    .map((col) => col.accessorKey.replace('.', '_'));
  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(
      Object.fromEntries(allColumnIds.map((id) => [id, true])),
    ),
  );

  const table = useReactTable({
    data: students,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.user.user_id,
    state: {
      sorting,
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

  return (
    <div class="card d-flex flex-column h-100">
      <div class="card-header bg-primary text-white">
        <div class="d-flex align-items-center justify-content-between">
          <div>Students</div>
          <div>
            <DownloadButton
              students={students}
              course={course}
              courseInstance={courseInstance}
              table={table}
            />
          </div>
        </div>
      </div>
      <div class="card-body d-flex flex-column">
        <div class="d-flex flex-row flex-wrap align-items-center mb-3 gap-2">
          <div class="flex-grow-1 flex-md-grow-0 col-xl-6 col-lg-8 col-md-7 d-flex flex-row gap-2">
            <div class="input-group">
              <input
                ref={searchInputRef}
                type="text"
                class="form-control"
                aria-label="Search by UID, name or email."
                placeholder="Search by UID, name, email..."
                value={globalFilter}
                onInput={(e) => {
                  if (!(e.target instanceof HTMLInputElement)) return;
                  setGlobalFilter(e.target.value);
                }}
              />
              <button
                type="button"
                class="btn btn-outline-secondary"
                aria-label="Clear search"
                title="Clear search"
                data-bs-toggle="tooltip"
                onClick={() => setGlobalFilter('')}
              >
                <i class="bi bi-x-circle" aria-hidden="true"></i>
              </button>
            </div>
            <ColumnManager table={table} />
          </div>
          <div class="flex-md-grow-1 d-flex flex-row justify-content-end">
            <div class="text-muted text-nowrap">
              Showing {table.getRowModel().rows.length} of {students.length} students
            </div>
          </div>
        </div>
        <div class="flex-grow-1">
          <StudentsTable table={table} />
        </div>
      </div>
    </div>
  );
}

/**
 * This needs to be a wrapper component because we need to use the `NuqsAdapter`.
 */
export const InstructorStudents = ({
  search,
  students,
  timezone,
  courseInstance,
  course,
}: {
  search: string;
} & StudentsCardProps) => {
  return (
    <NuqsAdapter search={search}>
      <StudentsCard
        students={students}
        timezone={timezone}
        courseInstance={courseInstance}
        course={course}
      />
    </NuqsAdapter>
  );
};

InstructorStudents.displayName = 'InstructorStudents';
