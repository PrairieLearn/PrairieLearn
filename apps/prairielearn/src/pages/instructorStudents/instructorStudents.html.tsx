import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useMemo, useState } from 'react';
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
import { SyncStudentsModal } from './components/SyncStudentsModal.js';
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

function ManageEnrollmentsDropdown({
  courseInstance,
  authzData,
  onInvite,
  onSync,
}: {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  authzData: PageContextWithAuthzData['authz_data'];
  onInvite: () => void;
  onSync: () => void;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const selfEnrollmentCodeLink = getSelfEnrollmentLinkUrl({
    courseInstanceId: courseInstance.id,
    enrollmentCode: courseInstance.enrollment_code,
  });

  const handleCopyLink = async (e: React.MouseEvent) => {
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

  const handleCopyCode = async (e: React.MouseEvent) => {
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

  const canEdit = authzData.has_course_instance_permission_edit;

  return (
    <DropdownButton as={ButtonGroup} title="Manage enrollments" size="sm" variant="light">
      <Dropdown.Item as="button" type="button" disabled={!canEdit} onClick={onInvite}>
        <i className="bi bi-person-plus me-2" aria-hidden="true" />
        Invite students
      </Dropdown.Item>
      <Dropdown.Item as="button" type="button" disabled={!canEdit} onClick={onSync}>
        <i className="bi bi-arrow-left-right me-2" aria-hidden="true" />
        Synchronize student list
      </Dropdown.Item>

      <Dropdown.Divider />
      {courseInstance.self_enrollment_use_enrollment_code && (
        <OverlayTrigger
          placement="right"
          tooltip={{
            body: copiedCode ? 'Copied!' : 'Copy',
            props: { id: 'students-copy-code-tooltip' },
          }}
          show={copiedCode ? true : undefined}
        >
          <Dropdown.Item
            as="button"
            type="button"
            disabled={!courseInstance.self_enrollment_enabled}
            onClick={handleCopyCode}
          >
            <i className="bi bi-key me-2" aria-hidden="true" />
            Copy enrollment code
          </Dropdown.Item>
        </OverlayTrigger>
      )}
      <OverlayTrigger
        placement="right"
        tooltip={{
          body: copiedLink ? 'Copied!' : 'Copy',
          props: { id: 'students-copy-link-tooltip' },
        }}
        show={copiedLink ? true : undefined}
      >
        <Dropdown.Item
          as="button"
          type="button"
          disabled={!courseInstance.self_enrollment_enabled}
          onClick={handleCopyLink}
        >
          <i className="bi bi-link-45deg me-2" aria-hidden="true" />
          Copy enrollment link
        </Dropdown.Item>
      </OverlayTrigger>
      <Dropdown.Item as="a" href={getSelfEnrollmentSettingsUrl(courseInstance.id)}>
        <i className="bi bi-gear me-2" aria-hidden="true" />
        Enrollment settings
      </Dropdown.Item>
    </DropdownButton>
  );
}

interface StudentsCardProps {
  authzData: PageContextWithAuthzData['authz_data'];
  course: PageContext<'courseInstance', 'instructor'>['course'];
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  students: StudentRow[];
  timezone: string;
  selfEnrollLink: string;
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
  students: initialStudents,
  timezone,
  csrfToken,
  selfEnrollLink,
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

  const queryClient = useQueryClient();

  const [showInvite, setShowInvite] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [copiedEnrollLink, setCopiedEnrollLink] = useState(false);

  const handleCopyEnrollLink = async () => {
    await copyToClipboard(selfEnrollLink);
    setCopiedEnrollLink(true);
    setTimeout(() => setCopiedEnrollLink(false), 2000);
  };

  const syncStudents = async (
    toInvite: string[],
    toCancelInvitation: string[],
    toRemove: string[],
  ): Promise<void> => {
    const body = {
      __action: 'sync_students',
      __csrf_token: csrfToken,
      toInvite,
      toCancelInvitation,
      toRemove,
    };
    const res = await fetch(window.location.href, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

  const inviteStudents = async (uids: string[]): Promise<void> => {
    const body = {
      __action: 'invite_uids',
      __csrf_token: csrfToken,
      uids: uids.join(','),
    };
    const res = await fetch(window.location.href, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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
              <i className="bi bi-question-circle" />
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
              <i className="bi bi-question-circle" />
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

  const emptyStateText = run(() => {
    const baseMessage = "This course doesn't have any students yet.";
    if (!courseInstance.modern_publishing) {
      // self-enrollment is always enabled for legacy publishing
      return `${baseMessage} Share the enrollment link to get started.`;
    }

    if (courseInstance.self_enrollment_enabled) {
      return `${baseMessage} Share the enrollment link or invite them to get started.`;
    }
    return `${baseMessage} Invite them to get started.`;
  });

  return (
    <>
      <TanstackTableCard
        table={table}
        title="Students"
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
          courseInstance.modern_publishing && (
            <ManageEnrollmentsDropdown
              courseInstance={courseInstance}
              authzData={authzData}
              onInvite={() => setShowInvite(true)}
              onSync={() => {
                // Reload the latest student data so that the preview of sync actions
                // will be as accurate as possible.
                void queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
                setShowSync(true);
              }}
            />
          )
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
              <div className="d-flex flex-column align-items-center gap-3">
                <div className="text-center">
                  <h5 className="mb-2">No students enrolled</h5>
                  <p className="text-muted mb-0" style={{ textWrap: 'balance' }}>
                    {emptyStateText}
                  </p>
                </div>
                {(courseInstance.modern_publishing || courseInstance.self_enrollment_enabled) && (
                  <div className="d-flex gap-2">
                    {courseInstance.self_enrollment_enabled && (
                      <OverlayTrigger
                        placement="top"
                        tooltip={{
                          body: 'Copied!',
                          props: { id: 'empty-state-copy-link-tooltip' },
                        }}
                        show={copiedEnrollLink}
                      >
                        <Button variant="primary" onClick={handleCopyEnrollLink}>
                          <i className="bi bi-link-45deg me-2" aria-hidden="true" />
                          Copy enrollment link
                        </Button>
                      </OverlayTrigger>
                    )}
                    {courseInstance.modern_publishing && (
                      <Button
                        variant={
                          courseInstance.self_enrollment_enabled ? 'outline-primary' : 'primary'
                        }
                        onClick={() => setShowInvite(true)}
                      >
                        <i className="bi bi-person-plus me-2" aria-hidden="true" />
                        Invite students
                      </Button>
                    )}
                  </div>
                )}
                {courseInstance.self_enrollment_enabled && (
                  <code className="bg-light text-muted px-3 py-2 rounded">{selfEnrollLink}</code>
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
        courseInstance={courseInstance}
        onHide={() => setShowInvite(false)}
        onSubmit={inviteStudents}
      />
      <SyncStudentsModal
        show={showSync}
        courseInstance={courseInstance}
        students={students}
        onHide={() => setShowSync(false)}
        onSubmit={syncStudents}
      />
    </>
  );
}

/**
 * This needs to be a wrapper component because we need to use the `NuqsAdapter`.
 */

export const InstructorStudents = ({
  authzData,
  selfEnrollLink,
  search,
  students,
  timezone,
  courseInstance,
  course,
  csrfToken,
  isDevMode,
}: {
  authzData: PageContextWithAuthzData['authz_data'];
  selfEnrollLink: string;
  search: string;
  isDevMode: boolean;
} & StudentsCardProps) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <StudentsCard
          authzData={authzData}
          selfEnrollLink={selfEnrollLink}
          course={course}
          courseInstance={courseInstance}
          students={students}
          timezone={timezone}
          csrfToken={csrfToken}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
