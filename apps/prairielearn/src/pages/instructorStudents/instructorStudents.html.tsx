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
import {
  Alert,
  Button,
  ButtonGroup,
  Dropdown,
  DropdownButton,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import z from 'zod';

import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../lib/client/nuqs.js';
import type {
  PageContextWithAuthzData,
  StaffCourseInstanceContext,
} from '../../lib/client/page-context.js';
import { type StaffEnrollment, StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { getSelfEnrollmentLinkUrl, getStudentEnrollmentUrl } from '../../lib/client/url.js';
import type { EnumEnrollmentStatus } from '../../lib/db-types.js';

import { ColumnManager } from './components/ColumnManager.js';
import { DownloadButton } from './components/DownloadButton.js';
import { InviteStudentModal } from './components/InviteStudentModal.js';
import { StudentsTable } from './components/StudentsTable.js';
import { STATUS_VALUES, type StudentRow, StudentRowSchema } from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [];

const DEFAULT_PINNING: ColumnPinningState = { left: ['user_uid'], right: [] };

const DEFAULT_ENROLLMENT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const columnHelper = createColumnHelper<StudentRow>();

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function CopyEnrollmentLinkButton({
  courseInstance,
}: {
  courseInstance: StaffCourseInstanceContext['course_instance'];
}) {
  const selfEnrollmentLink = getSelfEnrollmentLinkUrl({
    courseInstanceId: courseInstance.id,
    enrollmentCode: courseInstance.enrollment_code,
  });

  const handleCopyLink = async () => {
    const fullSelfEnrollmentLink = `${window.location.origin}${selfEnrollmentLink}`;
    await copyToClipboard(fullSelfEnrollmentLink);
  };

  const handleCopyCode = async () => {
    const enrollmentCodeDashed =
      courseInstance.enrollment_code.slice(0, 3) +
      '-' +
      courseInstance.enrollment_code.slice(3, 6) +
      '-' +
      courseInstance.enrollment_code.slice(6);
    await copyToClipboard(enrollmentCodeDashed);
  };

  // Show button only if self-enrollment is enabled
  if (!courseInstance.self_enrollment_enabled) {
    return null;
  }

  // If enrollment code is required, show split button
  if (courseInstance.self_enrollment_use_enrollment_code) {
    return (
      <DropdownButton
        as={ButtonGroup}
        title="Copy enrollment details"
        disabled={!courseInstance.self_enrollment_enabled}
        variant="light"
      >
        <Dropdown.Item onClick={handleCopyCode}>
          <i class="bi bi-key me-2" />
          Copy enrollment code
        </Dropdown.Item>
        <Dropdown.Item onClick={handleCopyLink}>
          <i class="bi bi-link-45deg me-2" />
          Copy enrollment link
        </Dropdown.Item>
      </DropdownButton>
    );
  }

  // If no enrollment code required, show simple button
  return (
    <Button
      variant="light"
      disabled={!courseInstance.self_enrollment_enabled}
      onClick={handleCopyLink}
    >
      <i class="bi bi-link-45deg me-2" />
      Copy enrollment link
    </Button>
  );
}

interface StudentsCardProps {
  authzData: PageContextWithAuthzData['authz_data'];
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  csrfToken: string;
  enrollmentManagementEnabled: boolean;
  students: StudentRow[];
  timezone: string;
  urlPrefix: string;
}

function StudentsCard({
  authzData,
  course,
  courseInstance,
  enrollmentManagementEnabled,
  students: initialStudents,
  timezone,
  csrfToken,
  urlPrefix,
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
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useQueryState(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(
      DEFAULT_ENROLLMENT_STATUS_FILTER,
    ),
  );
  const [lastInvitation, setLastInvitation] = useState<StaffEnrollment | null>(null);

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
      const res = await fetch(window.location.pathname + '/data.json');
      if (!res.ok) throw new Error('Failed to fetch students');
      const data = await res.json();
      const parsedData = z.array(StudentRowSchema).safeParse(data);
      if (!parsedData.success) throw new Error('Failed to parse students');
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData: initialStudents,
  });

  const [showInvite, setShowInvite] = useState(false);

  const inviteMutation = useMutation({
    mutationKey: ['invite-uid'],
    mutationFn: async (uid: string): Promise<StaffEnrollment> => {
      const body = new URLSearchParams({
        __action: 'invite_by_uid',
        __csrf_token: csrfToken,
        uid,
      });
      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        let message = 'Failed to invite';
        try {
          if (typeof json?.error === 'string') message = json.error;
        } catch {
          // ignore parse errors, and just use the default message
        }
        throw new Error(message);
      }
      return StaffEnrollmentSchema.parse(json.data);
    },
    onSuccess: async () => {
      // Force a refetch of the enrollments query to ensure the new student is included
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      setShowInvite(false);
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.user?.uid ?? row.enrollment.pending_uid, {
        id: 'user_uid',
        header: 'UID',
        cell: (info) => {
          return (
            <a href={getStudentEnrollmentUrl(urlPrefix, info.row.original.enrollment.id)}>
              {info.getValue()}
            </a>
          );
        },
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
        cell: (info) => <EnrollmentStatusIcon type="text" status={info.getValue()} />,
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
      columnHelper.accessor((row) => row.enrollment.first_joined_at, {
        id: 'enrollment_first_joined_at',
        header: 'Joined',
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
    <>
      {lastInvitation && (
        <Alert variant="success" dismissible onClose={() => setLastInvitation(null)}>
          {lastInvitation.pending_uid} was invited successfully.
        </Alert>
      )}
      <div class="card d-flex flex-column h-100">
        <div class="card-header bg-primary text-white">
          <div class="d-flex align-items-center justify-content-between gap-2">
            <div>Students</div>
            <div class="d-flex gap-2">
              <DownloadButton
                course={course}
                courseInstance={courseInstance}
                students={students}
                table={table}
              />
              <CopyEnrollmentLinkButton courseInstance={courseInstance} />
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
          onSubmit={async ({ uid }) => {
            const enrollment = await inviteMutation.mutateAsync(uid);
            setLastInvitation(enrollment);
          }}
        />
      </div>
    </>
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
  urlPrefix,
}: {
  authzData: PageContextWithAuthzData['authz_data'];
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
          urlPrefix={urlPrefix}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
