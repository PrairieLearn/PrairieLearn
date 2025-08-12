import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnPinningState,
  type ColumnSizingState,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';

import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../lib/client/nuqs.js';
import type { PageContext, StaffCourseInstanceContext } from '../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';

import { ColumnManager } from './components/ColumnManager.js';
import { DownloadButton } from './components/DownloadButton.js';
import { InviteStudentModal } from './components/InviteStudentModal.js';
import { StudentsTable } from './components/StudentsTable.js';
import { STATUS_VALUES, type StudentRow } from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [];

const DEFAULT_PINNING: ColumnPinningState = { left: ['user_uid'], right: [] };

const columnHelper = createColumnHelper<StudentRow>();

interface StudentsCardProps {
  authzData: PageContext['authz_data'];
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  csrfToken: string;
  enrollmentManagementEnabled: boolean;
  students: StudentRow[];
  timezone: string;
}

function StudentsCard({
  authzData,
  course,
  courseInstance,
  enrollmentManagementEnabled,
  students: initialStudents,
  timezone,
  csrfToken,
}: StudentsCardProps) {
  const queryClient = useQueryClient();

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
  const [isMediumOrLarger, setIsMediumOrLarger] = useState(false);

  useEffect(() => {
    // TODO: This is a workaround to avoid a hydration mismatch.
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
    setIsMediumOrLarger(mediaQuery?.matches ?? true);
  }, [mediaQuery]);

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

  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useQueryState(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault([]),
  );

  // The individual column filters are the source of truth, and this is derived from them.
  const columnFilters = useMemo(() => {
    return [
      {
        id: 'enrollment_status',
        value: enrollmentStatusFilter,
      },
    ];
  }, [enrollmentStatusFilter]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ['enrollments', 'students'],
    queryFn: async () => {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error('Failed to fetch students');
      return res.json();
    },
    enabled: false,
    initialData: initialStudents,
  });

  const [showInvite, setShowInvite] = useState(false);

  const inviteMutation = useMutation({
    mutationKey: ['invite-uid'],
    mutationFn: async (uid: string): Promise<void> => {
      const body = new URLSearchParams({
        __action: 'invite_by_uid',
        uid,
        __csrf_token: csrfToken,
      });
      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        let message = 'Failed to invite';
        try {
          const data = await res.json();
          if (typeof data?.error === 'string') message = data.error;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }
    },
    onSuccess: async () => {
      // Force a refetch of the enrollments query to ensure the new student is included
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      setShowInvite(false);
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.user?.uid ?? row.enrollment.pending_uid, {
        id: 'user_uid',
        header: 'UID',
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor((row) => row.user?.name, {
        id: 'user_name',
        header: 'Name',
        cell: (info) => {
          if (info.row.original.user) {
            return info.getValue() || '—';
          }
          return (
            <OverlayTrigger overlay={<Tooltip>Student information is not yet available.</Tooltip>}>
              <i class="bi bi-question-circle" />
            </OverlayTrigger>
          );
        },
      }),
      columnHelper.accessor((row) => row.enrollment.status, {
        id: 'enrollment_status',
        header: 'Status',
        cell: (info) => <EnrollmentStatusIcon status={info.getValue()} />,
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const current = row.getValue(columnId);
          if (typeof current !== 'string') return false;
          return filterValues.includes(current);
        },
      }),
      columnHelper.accessor((row) => row.user?.email, {
        id: 'user_email',
        header: 'Email',
        cell: (info) => {
          if (info.row.original.user) {
            return info.getValue() || '—';
          }
          return (
            <OverlayTrigger overlay={<Tooltip>Student information is not yet available.</Tooltip>}>
              <i class="bi bi-question-circle" />
            </OverlayTrigger>
          );
        },
      }),
      columnHelper.accessor((row) => row.enrollment.created_at, {
        id: 'enrollment_created_at',
        header: 'Enrolled',
        cell: (info) => {
          const date = info.getValue();
          if (date == null) return '—';
          return (
            <FriendlyDate date={date} timezone={timezone} options={{ includeTz: false }} tooltip />
          );
        },
      }),
    ],
    [timezone],
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
    getRowId: (row) => row.enrollment.id,
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
          <div class="d-flex gap-2">
            <DownloadButton
              course={course}
              courseInstance={courseInstance}
              students={students}
              table={table}
            />
            {enrollmentManagementEnabled && (
              <Button
                variant="light"
                disabled={!authzData.has_course_instance_permission_edit}
                onClick={() => setShowInvite(true)}
              >
                <i class="bi bi-person-plus me-2" />
                Invite student
              </Button>
            )}
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
          <StudentsTable
            table={table}
            enrollmentStatusFilter={enrollmentStatusFilter}
            setEnrollmentStatusFilter={setEnrollmentStatusFilter}
          />
        </div>
      </div>
      <InviteStudentModal
        show={showInvite}
        onHide={() => setShowInvite(false)}
        onSubmit={async (uid) => {
          await inviteMutation.mutateAsync(uid);
        }}
      />
    </div>
  );
}

/**
 * This needs to be a wrapper component because we need to use the `NuqsAdapter`.
 */

export const InstructorStudents = ({
  authzData,
  search,
  students,
  timezone,
  courseInstance,
  course,
  enrollmentManagementEnabled,
  csrfToken,
  isDevMode,
}: {
  authzData: PageContext['authz_data'];
  search: string;
  isDevMode: boolean;
} & StudentsCardProps) => {
  const queryClient = new QueryClient();

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <StudentsCard
          authzData={authzData}
          course={course}
          courseInstance={courseInstance}
          enrollmentManagementEnabled={enrollmentManagementEnabled}
          students={students}
          timezone={timezone}
          csrfToken={csrfToken}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
