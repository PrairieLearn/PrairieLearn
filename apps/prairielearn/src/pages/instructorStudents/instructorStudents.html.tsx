import {
  type ColumnFiltersState,
  type ColumnPinningState,
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

import { FriendlyDate } from '../../components/FriendlyDate.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../lib/client/nuqs.js';
import type { StaffCourseInstanceContext } from '../../lib/client/page-context.js';
import { getStudentDetailUrl } from '../../lib/client/url.js';

import { ColumnManager } from './components/ColumnManager.js';
import { DownloadButton } from './components/DownloadButton.js';
import { StudentsTable } from './components/StudentsTable.js';
import { type StudentRow } from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [];

const DEFAULT_PINNING: ColumnPinningState = { left: ['user_uid'], right: [] };

const columnHelper = createColumnHelper<StudentRow>();

interface StudentsCardProps {
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  students: StudentRow[];
  timezone: string;
  urlPrefix: string;
}

function StudentsCard({
  course,
  courseInstance,
  students,
  timezone,
  urlPrefix,
}: StudentsCardProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track screen size for aria-hidden
  const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)') : null;
  const [isMediumOrLarger, setIsMediumOrLarger] = useState(mediaQuery?.matches ?? true);

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsMediumOrLarger(e.matches);
    mediaQuery?.addEventListener('change', handler);
    return () => mediaQuery?.removeEventListener('change', handler);
  }, [mediaQuery]);

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

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.user.uid, {
        id: 'user_uid',
        header: 'UID',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor((row) => row.user.name, {
        id: 'user_name',
        header: 'Name',
        cell: (info) => (
          <a href={getStudentDetailUrl(urlPrefix, info.row.original.user.user_id)}>
            {info.getValue() || '—'}
          </a>
        ),
      }),
      columnHelper.accessor((row) => row.user.email, {
        id: 'user_email',
        header: 'Email',
        cell: (info) => info.getValue() || '—',
      }),
      columnHelper.accessor((row) => row.enrollment.created_at, {
        id: 'enrollment_created_at',
        header: 'Enrolled on',
        cell: (info) => {
          const date = info.getValue();
          if (date == null) return '—';
          return (
            <FriendlyDate date={date} timezone={timezone} options={{ includeTz: false }} tooltip />
          );
        },
      }),
    ],
    [timezone, urlPrefix],
  );

  const allColumnIds = columns.map((col) => col.id).filter((id) => typeof id === 'string');
  const defaultColumnVisibility = Object.fromEntries(allColumnIds.map((id) => [id, true]));
  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
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
    initialState: {
      columnPinning: DEFAULT_PINNING,
      columnVisibility: defaultColumnVisibility,
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
        <div class="d-flex align-items-center justify-content-between gap-2">
          <div>Students</div>
          <div>
            <DownloadButton
              course={course}
              courseInstance={courseInstance}
              students={students}
              table={table}
            />
          </div>
        </div>
      </div>
      <div class="card-body d-flex flex-column">
        <div class="d-flex flex-row flex-wrap align-items-center mb-3 gap-2">
          <div class="flex-grow-1 flex-lg-grow-0 col-xl-6 col-lg-7 d-flex flex-row gap-2">
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
                  void setGlobalFilter(e.target.value);
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
                <i class="bi bi-x-circle" aria-hidden="true" />
              </button>
            </div>
            {/* We do this instead of CSS properties for the accessibility checker */}
            {isMediumOrLarger && <ColumnManager table={table} />}
          </div>
          {/* We do this instead of CSS properties for the accessibility checker */}
          {!isMediumOrLarger && <ColumnManager table={table} />}
          <div class="flex-lg-grow-1 d-flex flex-row justify-content-end">
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
  urlPrefix,
}: {
  search: string;
} & StudentsCardProps) => {
  return (
    <NuqsAdapter search={search}>
      <StudentsCard
        course={course}
        courseInstance={courseInstance}
        students={students}
        timezone={timezone}
        urlPrefix={urlPrefix}
      />
    </NuqsAdapter>
  );
};

InstructorStudents.displayName = 'InstructorStudents';
