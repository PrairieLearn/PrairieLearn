import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type RowSelectionState,
  type SortingState,
  type Table,
  type Updater,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonGroup, Dropdown, DropdownButton, Form } from 'react-bootstrap';
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
import { StudentGroupWithUserDataSchema } from '../instructorStudentsGroups/instructorStudentsGroups.types.js';

import { InviteStudentsModal } from './components/InviteStudentsModal.js';
import {
  STATUS_VALUES,
  type StudentGroupInfo,
  type StudentRow,
  StudentRowSchema,
} from './instructorStudents.shared.js';

/**
 * A checkbox component that properly handles the indeterminate state using a ref and useEffect,
 * since React doesn't support indeterminate as a native attribute.
 */
function SelectAllCheckbox({ table }: { table: Table<StudentRow> }) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const isIndeterminate = table.getIsSomeRowsSelected();

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={table.getIsAllRowsSelected()}
      autoComplete="off"
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  );
}

/**
 * A checkbox component for handling indeterminate state in group selection.
 */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input ref={checkboxRef} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
  );
}

// This default must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [{ id: 'user_uid', desc: false }];

const DEFAULT_PINNING: ColumnPinningState = { left: ['select', 'user_uid'], right: [] };

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
            <i className="bi bi-key me-2" />
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
            <i className="bi bi-link-45deg me-2" />
            Copy enrollment link
          </Dropdown.Item>
        </OverlayTrigger>
      )}
      <Dropdown.Item as="a" href={getSelfEnrollmentSettingsUrl(courseInstance.id)}>
        <i className="bi bi-gear me-2" />
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
  students: StudentRow[];
  studentGroups: StudentGroupInfo[];
  timezone: string;
  selfEnrollLink: string;
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
  students: initialStudents,
  studentGroups: initialStudentGroups,
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
  const [studentGroupsFilter, setStudentGroupsFilter] = useQueryState(
    'student_groups',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [newGroupName, setNewGroupName] = useState('');

  const { createCheckboxProps } = useShiftClickCheckbox<StudentRow>();

  const queryClient = useQueryClient();

  // Fetch student groups for batch actions
  const { data: studentGroups = initialStudentGroups } = useQuery<StudentGroupInfo[]>({
    queryKey: ['student-groups', courseInstance.id],
    queryFn: async () => {
      const res = await fetch(
        `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students/groups/data.json`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error('Failed to fetch student groups');
      const data = await res.json();
      const groups = z.array(StudentGroupWithUserDataSchema).parse(data);
      return groups.map((g) => ({
        id: g.student_group.id,
        name: g.student_group.name,
        color: g.student_group.color,
      }));
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
  const [copiedEnrollLink, setCopiedEnrollLink] = useState(false);

  const handleCopyEnrollLink = async () => {
    await copyToClipboard(selfEnrollLink);
    setCopiedEnrollLink(true);
    setTimeout(() => setCopiedEnrollLink(false), 2000);
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
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => <SelectAllCheckbox table={table} />,
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
      columnHelper.accessor((row) => row.student_groups, {
        id: 'student_groups',
        meta: {
          label: 'Student Groups',
        },
        header: () => (
          <span className="d-inline-flex align-items-center gap-1">
            <span>Groups</span>
            <i className="fas fa-users" />
          </span>
        ),
        cell: (info) => {
          const groups = info.getValue();
          if (groups.length === 0) return '—';
          const groupsUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students/groups`;
          return (
            <div className="d-flex flex-wrap gap-1">
              {groups.map((group) => (
                <a
                  key={group.id}
                  href={`${groupsUrl}?group=${encodeURIComponent(group.name)}`}
                  className="badge text-decoration-none"
                  style={{ backgroundColor: `var(--color-${group.color ?? 'gray1'})` }}
                >
                  {group.name}
                </a>
              ))}
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

  // Calculate group membership state for each group: 'all', 'none', or 'some'
  const groupMembershipState = useMemo(() => {
    const states = new Map<string, 'all' | 'none' | 'some'>();

    if (selectedRows.length === 0) {
      studentGroups.forEach((g) => states.set(g.id, 'none'));
      return states;
    }

    studentGroups.forEach((group) => {
      const membersInGroup = selectedRows.filter((row) =>
        row.original.student_groups.some((g) => g.id === group.id),
      ).length;

      if (membersInGroup === 0) {
        states.set(group.id, 'none');
      } else if (membersInGroup === selectedRows.length) {
        states.set(group.id, 'all');
      } else {
        states.set(group.id, 'some');
      }
    });

    return states;
  }, [selectedRows, studentGroups]);

  // Check if any group mutation is pending
  const isGroupMutationPending =
    batchAddToGroupMutation.isPending ||
    batchRemoveFromGroupMutation.isPending ||
    createGroupAndAddMutation.isPending;
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
          <>
            {authzData.has_course_instance_permission_edit && (
              <Dropdown autoClose="outside">
                <Dropdown.Toggle
                  variant="light"
                  size="sm"
                  disabled={selectedEnrollmentIds.length === 0}
                >
                  Groups
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {studentGroups.map((group) => {
                    const state = groupMembershipState.get(group.id);
                    const isChecked = state === 'all';
                    const isIndeterminate = state === 'some';

                    return (
                      <Dropdown.Item
                        key={group.id}
                        as="label"
                        className="d-flex align-items-center gap-2"
                        style={{ cursor: isGroupMutationPending ? 'wait' : 'pointer' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IndeterminateCheckbox
                          checked={isChecked}
                          indeterminate={isIndeterminate}
                          disabled={isGroupMutationPending}
                          onChange={() => {
                            if (isChecked) {
                              batchRemoveFromGroupMutation.mutate({
                                enrollmentIds: selectedEnrollmentIds,
                                studentGroupId: group.id,
                              });
                            } else {
                              batchAddToGroupMutation.mutate({
                                enrollmentIds: selectedEnrollmentIds,
                                studentGroupId: group.id,
                              });
                            }
                          }}
                        />
                        <span>{group.name}</span>
                      </Dropdown.Item>
                    );
                  })}
                  {studentGroups.length > 0 && <Dropdown.Divider />}
                  <Dropdown.Item
                    as="div"
                    className="p-2 bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="d-flex gap-2 align-items-center">
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="New group name"
                        value={newGroupName}
                        disabled={isGroupMutationPending}
                        onChange={(e) => setNewGroupName((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newGroupName.trim() && !isGroupMutationPending) {
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
                        disabled={!newGroupName.trim() || isGroupMutationPending}
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
                        <i className="bi bi-plus" />
                      </Button>
                    </div>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
            {courseInstance.modern_publishing && (
              <>
                <Button
                  variant="light"
                  size="sm"
                  disabled={!authzData.has_course_instance_permission_edit}
                  onClick={() => setShowInvite(true)}
                >
                  <i className="bi bi-person-plus me-2" aria-hidden="true" />
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
  studentGroups,
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
          studentGroups={studentGroups}
          timezone={timezone}
          csrfToken={csrfToken}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
