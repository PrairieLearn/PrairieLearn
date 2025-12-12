import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type RowSelectionState,
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
import { Alert, Button, ButtonGroup, Dropdown, DropdownButton, Form } from 'react-bootstrap';
import z from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  NuqsAdapter,
  OverlayTrigger,
  TanstackTableCard,
  TanstackTableEmptyState,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import type { PageContext, PageContextWithAuthzData } from '../../lib/client/page-context.js';
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
import { StudentGroupRowSchema } from '../instructorInstanceAdminStudentGroups/instructorInstanceAdminStudentGroups.types.js';

import { InviteStudentModal } from './components/InviteStudentModal.js';
import {
  STATUS_VALUES,
  type StudentGroupInfo,
  type StudentRow,
  StudentRowSchema,
} from './instructorStudents.shared.js';

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [{ id: 'user_uid', desc: false }];

const DEFAULT_PINNING: ColumnPinningState = { left: ['select', 'user_uid'], right: [] };

const DEFAULT_ENROLLMENT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const columnHelper = createColumnHelper<StudentRow>();

// Predefined color palette for student group chips
const STUDENT_GROUP_COLORS = [
  'blue2',
  'green2',
  'purple2',
  'orange2',
  'turquoise2',
  'pink2',
  'yellow2',
  'red2',
] as const;

/**
 * Assigns a color to a student group based on its ID.
 * This ensures consistent coloring across renders.
 */
function getStudentGroupColor(groupId: string): string {
  // Convert the ID string to a number for consistent hashing
  // Use a simple hash to distribute colors evenly
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    const char = groupId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32-bit integer
  }
  const colorIndex = Math.abs(hash) % STUDENT_GROUP_COLORS.length;
  return STUDENT_GROUP_COLORS[colorIndex];
}

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
  studentGroups: StudentGroupInfo[];
  timezone: string;
}

type ColumnId =
  | 'select'
  | 'user_uid'
  | 'user_name'
  | 'enrollment_status'
  | 'user_email'
  | 'enrollment_first_joined_at'
  | 'student_groups';

function StudentsCard({
  authzData,
  course,
  courseInstance,
  enrollmentManagementEnabled,
  students: initialStudents,
  studentGroups: initialStudentGroups,
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
  const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useQueryState(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(
      DEFAULT_ENROLLMENT_STATUS_FILTER,
    ),
  );
  const [studentGroupsFilter, setStudentGroupsFilter] = useQueryState(
    'student_groups',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [lastInvitation, setLastInvitation] = useState<StaffEnrollment | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [newGroupName, setNewGroupName] = useState('');
  const [addToGroupDropdownOpen, setAddToGroupDropdownOpen] = useState(false);

  const { createCheckboxProps } = useShiftClickCheckbox<StudentRow>();

  // Fetch student groups for batch actions
  const { data: studentGroups = initialStudentGroups } = useQuery<StudentGroupInfo[]>({
    queryKey: ['student-groups', courseInstance.id],
    queryFn: async () => {
      const res = await fetch(
        `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/student_groups/data.json`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error('Failed to fetch student groups');
      const data = await res.json();
      const groups = z.array(StudentGroupRowSchema).parse(data);
      // Transform StudentGroupRow[] to StudentGroupInfo[] (drop student_count)
      return groups.map((g) => ({ id: g.id, name: g.name }));
    },
    staleTime: Infinity,
    initialData: initialStudentGroups,
  });

  // The individual column filters are the source of truth, and this is derived from them.
  const columnFilters: { id: ColumnId; value: any }[] = useMemo(() => {
    return [
      {
        id: 'enrollment_status',
        value: enrollmentStatusFilter,
      },
      {
        id: 'student_groups',
        value: studentGroupsFilter,
      },
    ];
  }, [enrollmentStatusFilter, studentGroupsFilter]);

  const columnFilterSetters = useMemo<Record<ColumnId, Updater<any>>>(() => {
    return {
      select: undefined,
      user_uid: undefined,
      user_name: undefined,
      enrollment_status: setEnrollmentStatusFilter,
      user_email: undefined,
      enrollment_first_joined_at: undefined,
      student_groups: setStudentGroupsFilter,
    };
  }, [setEnrollmentStatusFilter, setStudentGroupsFilter]);

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

  // Batch action mutations
  const batchAddToGroupMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      studentGroupId,
    }: {
      enrollmentIds: string[];
      studentGroupId: string;
    }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_add_to_group',
          __csrf_token: csrfToken,
          enrollment_ids: enrollmentIds,
          student_group_id: studentGroupId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to add to group');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      setRowSelection({});
    },
  });

  const batchRemoveFromGroupMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      studentGroupId,
    }: {
      enrollmentIds: string[];
      studentGroupId: string;
    }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_remove_from_group',
          __csrf_token: csrfToken,
          enrollment_ids: enrollmentIds,
          student_group_id: studentGroupId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to remove from group');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      setRowSelection({});
    },
  });

  const createGroupAndAddMutation = useMutation({
    mutationFn: async ({ enrollmentIds, name }: { enrollmentIds: string[]; name: string }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'create_group_and_add_students',
          __csrf_token: csrfToken,
          enrollment_ids: enrollmentIds,
          name: name.trim(),
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to create group and add students');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      await queryClient.invalidateQueries({ queryKey: ['student-groups'] });
      setNewGroupName('');
      setRowSelection({});
      setAddToGroupDropdownOpen(false);
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            autocomplete="off"
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row, table }) => {
          return <input type="checkbox" {...createCheckboxProps(row, table)} />;
        },
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableHiding: false,
        enablePinning: true,
      }),
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
      columnHelper.accessor((row) => row.student_groups, {
        id: 'student_groups',
        meta: {
          label: 'Student Groups',
        },
        header: () => {
          const studentGroupsUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/student_groups`;
          return (
            <a
              href={studentGroupsUrl}
              class="text-decoration-none d-inline-flex align-items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Groups</span>
              <i class="fas fa-users" />
            </a>
          );
        },
        cell: (info) => {
          const groups = info.getValue();
          if (groups.length === 0) return '—';
          return (
            <div class="d-flex flex-wrap gap-1">
              {groups.map((group) => {
                const color = getStudentGroupColor(group.id);
                return (
                  <span key={group.id} class={`badge color-${color}`}>
                    {group.name}
                  </span>
                );
              })}
            </div>
          );
        },
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const studentGroupIds = new Set(
            row.getValue<StudentRow['student_groups']>(columnId).map((g) => g.id),
          );
          return filterValues.some((filterId) => studentGroupIds.has(filterId));
        },
      }),
    ],
    [timezone, courseInstance.id, createCheckboxProps],
  );

  const allColumnIds = columns
    .map((col) => col.id)
    .filter((id): id is string => typeof id === 'string' && id !== 'select');
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
    enableRowSelection: true,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnSizing,
      columnVisibility,
      columnPinning,
      rowSelection,
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
    onRowSelectionChange: setRowSelection,
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

  // Calculate selected enrollment IDs and common groups for batch actions
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedEnrollmentIds = selectedRows.map((row) => row.original.enrollment.id);

  // Find groups that ALL selected students share (for "remove from group" option)
  const commonGroups = useMemo(() => {
    if (selectedRows.length === 0) return [];
    const groupSets = selectedRows.map(
      (row) => new Set(row.original.student_groups.map((g) => g.id)),
    );
    const firstSet = groupSets[0];
    const commonGroupIds = new Set(
      [...firstSet].filter((id) => groupSets.every((set) => set.has(id))),
    );
    return studentGroups.filter((g) => commonGroupIds.has(g.id));
  }, [selectedRows, studentGroups]);

  // Find groups that ALL selected students are already in (to exclude from "add to group")
  const groupsAllSelectedStudentsAreIn = useMemo(() => {
    if (selectedRows.length === 0) return new Set<string>();
    const groupSets = selectedRows.map(
      (row) => new Set(row.original.student_groups.map((g) => g.id)),
    );
    const firstSet = groupSets[0];
    const commonGroupIds = [...firstSet].filter((id) => groupSets.every((set) => set.has(id)));
    return new Set(commonGroupIds);
  }, [selectedRows]);

  // Groups available for "add to group" (exclude groups all students are already in)
  const availableGroupsForAdd = useMemo(() => {
    return studentGroups.filter((g) => !groupsAllSelectedStudentsAreIn.has(g.id));
  }, [studentGroups, groupsAllSelectedStudentsAreIn]);

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
          hasSelection: false,
        }}
        headerButtons={
          <>
            {authzData.has_course_instance_permission_edit && (
              <>
                {(availableGroupsForAdd.length > 0 || selectedEnrollmentIds.length > 0) && (
                  <DropdownButton
                    title="Add to group"
                    size="sm"
                    variant="light"
                    show={addToGroupDropdownOpen}
                    disabled={
                      selectedEnrollmentIds.length === 0 ||
                      (batchAddToGroupMutation.isPending && createGroupAndAddMutation.isPending)
                    }
                    as={ButtonGroup}
                    onToggle={(isOpen) => setAddToGroupDropdownOpen(isOpen)}
                  >
                    {availableGroupsForAdd.map((group) => (
                      <Dropdown.Item
                        key={group.id}
                        onClick={() =>
                          batchAddToGroupMutation.mutate({
                            enrollmentIds: selectedEnrollmentIds,
                            studentGroupId: group.id,
                          })
                        }
                      >
                        {group.name}
                      </Dropdown.Item>
                    ))}
                    {availableGroupsForAdd.length > 0 && selectedEnrollmentIds.length > 0 && (
                      <Dropdown.Divider />
                    )}
                    {selectedEnrollmentIds.length > 0 && (
                      <Dropdown.Item
                        as="div"
                        class="p-2 bg-transparent"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div class="d-flex gap-2 align-items-center">
                          <Form.Control
                            type="text"
                            size="sm"
                            placeholder="New group name"
                            value={newGroupName}
                            disabled={createGroupAndAddMutation.isPending}
                            onChange={(e) => setNewGroupName((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => {
                              if (
                                e.key === 'Enter' &&
                                newGroupName.trim() &&
                                !createGroupAndAddMutation.isPending
                              ) {
                                e.preventDefault();
                                createGroupAndAddMutation.mutate({
                                  enrollmentIds: selectedEnrollmentIds,
                                  name: newGroupName,
                                });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={!newGroupName.trim() || createGroupAndAddMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (newGroupName.trim()) {
                                createGroupAndAddMutation.mutate({
                                  enrollmentIds: selectedEnrollmentIds,
                                  name: newGroupName,
                                });
                              }
                            }}
                          >
                            <i class="bi bi-plus" />
                          </Button>
                        </div>
                      </Dropdown.Item>
                    )}
                  </DropdownButton>
                )}
                {commonGroups.length > 0 && (
                  <DropdownButton
                    as={ButtonGroup}
                    title="Remove from group"
                    size="sm"
                    variant="light"
                    disabled={
                      selectedEnrollmentIds.length === 0 || batchRemoveFromGroupMutation.isPending
                    }
                  >
                    {commonGroups.map((group) => (
                      <Dropdown.Item
                        key={group.id}
                        onClick={() =>
                          batchRemoveFromGroupMutation.mutate({
                            enrollmentIds: selectedEnrollmentIds,
                            studentGroupId: group.id,
                          })
                        }
                      >
                        {group.name}
                      </Dropdown.Item>
                    ))}
                  </DropdownButton>
                )}
              </>
            )}
            {enrollmentManagementEnabled && courseInstance.modern_publishing && (
              <>
                <Button
                  variant="light"
                  size="sm"
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
            student_groups: ({
              header,
            }: {
              header: Header<StudentRow, StudentRow['student_groups']>;
            }) => {
              const groupIds = studentGroups.map((g) => g.id);
              return (
                <MultiSelectColumnFilter
                  column={header.column as any}
                  allColumnValues={groupIds as any}
                  renderValueLabel={({ value }) => {
                    const group = studentGroups.find((g) => g.id === String(value));
                    if (!group) return <span>{String(value)}</span>;
                    return <span>{group.name}</span>;
                  }}
                />
              );
            },
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
  studentGroups,
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
          studentGroups={studentGroups}
          timezone={timezone}
          csrfToken={csrfToken}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
