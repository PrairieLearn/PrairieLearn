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
import { useMemo, useState } from 'preact/compat';
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

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import {
  CategoricalColumnFilter,
  TanstackTableCard,
  TanstackTableEmptyState,
} from '@prairielearn/ui';

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
import {
  getSelfEnrollmentLinkUrl,
  getSelfEnrollmentSettingsUrl,
  getStudentCourseInstanceUrl,
  getStudentEnrollmentUrl,
} from '../../lib/client/url.js';
import type { EnumEnrollmentStatus } from '../../lib/db-types.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { InviteStudentModal } from './components/InviteStudentModal.js';
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const selfEnrollmentCodeLink = getSelfEnrollmentLinkUrl({
    courseInstanceId: courseInstance.id,
    enrollmentCode: courseInstance.enrollment_code,
  });

  const handleCopyLink = async (e: Event) => {
    e.stopPropagation();
    const selfEnrollmentLink = run(() => {
      if (!courseInstance.self_enrollment_use_enrollment_code) {
        return getStudentCourseInstanceUrl(courseInstance.id);
      }
      return selfEnrollmentCodeLink;
    });
    await copyToClipboard(`${window.location.origin}${selfEnrollmentLink}`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = async (e: Event) => {
    e.stopPropagation();
    const enrollmentCodeDashed =
      courseInstance.enrollment_code.slice(0, 3) +
      '-' +
      courseInstance.enrollment_code.slice(3, 6) +
      '-' +
      courseInstance.enrollment_code.slice(6);
    await copyToClipboard(enrollmentCodeDashed);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <DropdownButton
      as={ButtonGroup}
      title="Enrollment details"
      disabled={!courseInstance.self_enrollment_enabled}
      variant="light"
    >
      {courseInstance.self_enrollment_use_enrollment_code && (
        <OverlayTrigger
          placement="right"
          overlay={<Tooltip>{copiedCode ? 'Copied!' : 'Copy'}</Tooltip>}
          show={copiedCode ? true : undefined}
        >
          <Dropdown.Item as="button" type="button" onClick={handleCopyCode}>
            <i class="bi bi-key me-2" />
            Copy enrollment code
          </Dropdown.Item>
        </OverlayTrigger>
      )}

      {courseInstance.self_enrollment_enabled && (
        <OverlayTrigger
          placement="right"
          overlay={<Tooltip>{copiedLink ? 'Copied!' : 'Copy'}</Tooltip>}
          show={copiedLink ? true : undefined}
        >
          <Dropdown.Item as="button" type="button" onClick={handleCopyLink}>
            <i class="bi bi-link-45deg me-2" />
            Copy enrollment link
          </Dropdown.Item>
        </OverlayTrigger>
      )}
      <Dropdown.Item as="a" href={getSelfEnrollmentSettingsUrl(courseInstance.id)}>
        <i class="bi bi-gear me-2" />
        Manage settings
      </Dropdown.Item>
    </DropdownButton>
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
      const res = await fetch(window.location.pathname + '/data.json', {
        headers: {
          Accept: 'application/json',
        },
      });
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
        headers: {
          Accept: 'application/json',
        },
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
          const current = row.getValue<StudentRow['enrollment']['status']>(columnId);
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
      <TanstackTableCard
        table={table}
        title="Students"
        // eslint-disable-next-line @eslint-react/no-forbidden-props
        className="h-100"
        singularLabel="student"
        pluralLabel="students"
        downloadButtonOptions={{
          filenameBase: `${courseInstanceFilenamePrefix(courseInstance, course)}students`,
          mapRowToData: (row) => {
            return {
              uid: row.user?.uid ?? row.enrollment.pending_uid,
              name: row.user?.name ?? null,
              email: row.user?.email ?? null,
              status: row.enrollment.status,
              first_joined_at: row.enrollment.first_joined_at
                ? formatDate(row.enrollment.first_joined_at, course.display_timezone, {
                    includeTz: false,
                  })
                : null,
            };
          },
        }}
        headerButtons={
          <>
            {enrollmentManagementEnabled && (
              <>
                <Button
                  variant="light"
                  disabled={!authzData.has_course_instance_permission_edit}
                  onClick={() => setShowInvite(true)}
                >
                  <i class="bi bi-person-plus me-2" aria-hidden="true" />
                  Invite student
                </Button>
                <CopyEnrollmentLinkButton courseInstance={courseInstance} />
              </>
            )}
          </>
        }
        globalFilter={{
          value: globalFilter,
          setValue: setGlobalFilter,
          placeholder: 'Search by UID, name, email...',
        }}
        tableOptions={{
          filters: {
            enrollment_status: ({ header }) => (
              <CategoricalColumnFilter
                columnId={header.column.id}
                columnLabel="Status"
                allColumnValues={STATUS_VALUES}
                renderValueLabel={({ value }) => (
                  <EnrollmentStatusIcon type="text" status={value} />
                )}
                columnValuesFilter={enrollmentStatusFilter}
                setColumnValuesFilter={setEnrollmentStatusFilter}
              />
            ),
          },
          emptyState: (
            <TanstackTableEmptyState iconName="bi-person-exclamation">
              No students found. To enroll students in your course, you can provide them with a link
              to enroll (recommended) or invite them. You can manage the self-enrollment settings on
              the{' '}
              <a href={getSelfEnrollmentSettingsUrl(courseInstance.id)}>course instance settings</a>{' '}
              page.
            </TanstackTableEmptyState>
          ),
          noResultsState: (
            <TanstackTableEmptyState iconName="bi-search">
              No students found matching your search criteria.
            </TanstackTableEmptyState>
          ),
        }}
      />
      <InviteStudentModal
        show={showInvite}
        onHide={() => setShowInvite(false)}
        onSubmit={async ({ uid }) => {
          const enrollment = await inviteMutation.mutateAsync(uid);
          setLastInvitation(enrollment);
        }}
      />
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
