import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type SortingState,
  type Updater,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'preact/compat';
import { Button, ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';
import z from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import {
  CategoricalColumnFilter,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  TanstackTableEmptyState,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import type { PageContext, PageContextWithAuthzData } from '../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import {
  getCourseInstanceJobSequenceUrl,
  getSelfEnrollmentLinkUrl,
  getSelfEnrollmentSettingsUrl,
  getStudentCourseInstanceUrl,
  getStudentEnrollmentUrl,
} from '../../lib/client/url.js';
import type { EnumEnrollmentStatus } from '../../lib/db-types.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';

import { InviteStudentsModal } from './components/InviteStudentsModal.js';
import { STATUS_VALUES, type StudentRow, StudentRowSchema } from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [{ id: 'user_uid', desc: false }];

const DEFAULT_PINNING: ColumnPinningState = { left: ['user_uid'], right: [] };

const DEFAULT_ENROLLMENT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const columnHelper = createColumnHelper<StudentRow>();

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function CopyEnrollmentLinkButton({
  courseInstance,
}: {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
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
      size="sm"
      disabled={!courseInstance.self_enrollment_enabled}
      variant="light"
    >
      {courseInstance.self_enrollment_use_enrollment_code && (
        <OverlayTrigger
          placement="right"
          tooltip={{
            body: copiedCode ? 'Copied!' : 'Copy',
            props: { id: 'students-copy-code-tooltip' },
          }}
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
          tooltip={{
            body: copiedLink ? 'Copied!' : 'Copy',
            props: { id: 'students-copy-link-tooltip' },
          }}
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
  course: PageContext<'courseInstance', 'instructor'>['course'];
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  enrollmentManagementEnabled: boolean;
  students: StudentRow[];
  timezone: string;
}

type ColumnId =
  | 'user_uid'
  | 'user_name'
  | 'enrollment_status'
  | 'user_email'
  | 'enrollment_first_joined_at';

function StudentsCard({
  authzData,
  course,
  courseInstance,
  enrollmentManagementEnabled,
  students: initialStudents,
  timezone,
  csrfToken,
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
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useQueryState(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(
      DEFAULT_ENROLLMENT_STATUS_FILTER,
    ),
  );

  // The individual column filters are the source of truth, and this is derived from them.
  const columnFilters: { id: ColumnId; value: any }[] = useMemo(() => {
    return [
      {
        id: 'enrollment_status',
        value: enrollmentStatusFilter,
      },
    ];
  }, [enrollmentStatusFilter]);

  const columnFilterSetters = useMemo<Record<ColumnId, Updater<any>>>(() => {
    return {
      user_uid: undefined,
      user_name: undefined,
      enrollment_status: setEnrollmentStatusFilter,
      user_email: undefined,
      enrollment_first_joined_at: undefined,
    };
  }, [setEnrollmentStatusFilter]);

  // Sync TanStack column filter changes back to URL
  const handleColumnFiltersChange = useMemo(
    () => (updaterOrValue: Updater<ColumnFiltersState>) => {
      const newFilters =
        typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      for (const filter of newFilters) {
        columnFilterSetters[filter.id as ColumnId]?.(filter.value);
      }
    },
    [columnFilters, columnFilterSetters],
  );

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
  const [copiedEnrollLink, setCopiedEnrollLink] = useState(false);

  const handleCopyEnrollLink = async () => {
    const selfEnrollmentLink = courseInstance.self_enrollment_use_enrollment_code
      ? getSelfEnrollmentLinkUrl({
          courseInstanceId: courseInstance.id,
          enrollmentCode: courseInstance.enrollment_code,
        })
      : getStudentCourseInstanceUrl(courseInstance.id);
    await copyToClipboard(`${window.location.origin}${selfEnrollmentLink}`);
    setCopiedEnrollLink(true);
    setTimeout(() => setCopiedEnrollLink(false), 2000);
  };

  const inviteStudents = async (uids: string[]): Promise<void> => {
    const body = new URLSearchParams({
      __action: 'invite_uids',
      __csrf_token: csrfToken,
      uids: uids.join(','),
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
      throw new Error(json.error);
    }
    const { job_sequence_id } = z
      .object({
        job_sequence_id: z.string(),
      })
      .parse(json);

    window.location.href = getCourseInstanceJobSequenceUrl(courseInstance.id, job_sequence_id);
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.user?.uid ?? row.enrollment.pending_uid, {
        id: 'user_uid',
        header: 'UID',
        cell: (info) => {
          return (
            <a href={getStudentEnrollmentUrl(courseInstance.id, info.row.original.enrollment.id)}>
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
            <OverlayTrigger
              tooltip={{
                body: 'Student information is not yet available.',
                props: { id: 'students-name-tooltip' },
              }}
            >
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
            <OverlayTrigger
              tooltip={{
                body: 'Student information is not yet available.',
                props: { id: 'students-email-tooltip' },
              }}
            >
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
    [timezone, courseInstance.id],
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
    onColumnFiltersChange: handleColumnFiltersChange,
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
            return [
              { value: row.user?.uid ?? row.enrollment.pending_uid, name: 'uid' },
              { value: row.user?.name ?? null, name: 'name' },
              { value: row.user?.email ?? null, name: 'email' },
              { value: row.enrollment.status, name: 'status' },
              {
                value: row.enrollment.first_joined_at
                  ? formatDate(row.enrollment.first_joined_at, course.display_timezone, {
                      includeTz: false,
                    })
                  : null,
                name: 'first_joined_at',
              },
            ];
          },
          hasSelection: false,
        }}
        headerButtons={
          <>
            {enrollmentManagementEnabled && courseInstance.modern_publishing && (
              <>
                <Button
                  variant="light"
                  size="sm"
                  disabled={!authzData.has_course_instance_permission_edit}
                  onClick={() => setShowInvite(true)}
                >
                  <i class="bi bi-person-plus me-2" aria-hidden="true" />
                  Invite students
                </Button>
                <CopyEnrollmentLinkButton courseInstance={courseInstance} />
              </>
            )}
          </>
        }
        globalFilter={{
          placeholder: 'Search by UID, name, email...',
        }}
        tableOptions={{
          filters: {
            enrollment_status: ({
              header,
            }: {
              header: Header<StudentRow, StudentRow['enrollment']['status']>;
            }) => (
              <CategoricalColumnFilter
                column={header.column}
                allColumnValues={STATUS_VALUES}
                renderValueLabel={({ value }) => (
                  <EnrollmentStatusIcon type="text" status={value} />
                )}
              />
            ),
          },
          emptyState: (
            <TanstackTableEmptyState iconName="bi-person-plus">
              <div class="d-flex flex-column align-items-center gap-3">
                <div class="text-center">
                  <h5 class="mb-2">No students enrolled</h5>
                  <p class="text-muted mb-0">
                    This course doesn't have any students yet. Invite students to join or share the
                    enrollment link to get started.
                  </p>
                </div>
                <div class="d-flex gap-2">
                  <Button variant="dark" onClick={() => setShowInvite(true)}>
                    <i class="bi bi-person-plus me-2" aria-hidden="true" />
                    Invite students
                  </Button>
                  {courseInstance.self_enrollment_enabled && (
                    <OverlayTrigger
                      placement="top"
                      tooltip={{
                        body: 'Copied!',
                        props: { id: 'empty-state-copy-link-tooltip' },
                      }}
                      show={copiedEnrollLink}
                    >
                      <Button variant="outline-dark" onClick={handleCopyEnrollLink}>
                        <i class="bi bi-link-45deg me-2" aria-hidden="true" />
                        Copy enrollment link
                      </Button>
                    </OverlayTrigger>
                  )}
                </div>
                {courseInstance.self_enrollment_enabled && (
                  <code class="bg-light text-muted px-3 py-2 rounded">
                    {`${window.location.origin}${
                      courseInstance.self_enrollment_use_enrollment_code
                        ? getSelfEnrollmentLinkUrl({
                            courseInstanceId: courseInstance.id,
                            enrollmentCode: courseInstance.enrollment_code,
                          })
                        : getStudentCourseInstanceUrl(courseInstance.id)
                    }`}
                  </code>
                )}
              </div>
            </TanstackTableEmptyState>
          ),
          noResultsState: (
            <TanstackTableEmptyState iconName="bi-search">
              No students found matching your search criteria.
            </TanstackTableEmptyState>
          ),
        }}
      />
      <InviteStudentsModal
        show={showInvite}
        onHide={() => setShowInvite(false)}
        onSubmit={inviteStudents}
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
}: {
  authzData: PageContextWithAuthzData['authz_data'];
  search: string;
  isDevMode: boolean;
} & StudentsCardProps) => {
  const [queryClient] = useState(() => new QueryClient());

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
