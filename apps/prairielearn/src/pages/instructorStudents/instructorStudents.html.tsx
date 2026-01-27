import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Column,
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
import { StudentLabelBadge } from '../../components/StudentLabelBadge.js';
import type { PageContext, PageContextWithAuthzData } from '../../lib/client/page-context.js';
import type { StaffStudentLabel } from '../../lib/client/safe-db-types.js';
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
import { StudentLabelWithUserDataSchema } from '../instructorStudentsLabels/instructorStudentsLabels.types.js';

import { InviteStudentsModal } from './components/InviteStudentsModal.js';
import { STATUS_VALUES, type StudentRow, StudentRowSchema } from './instructorStudents.shared.js';

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
      aria-label="Select all students"
      onChange={table.getToggleAllRowsSelectedHandler()}
    />
  );
}

/**
 * A checkbox component for handling indeterminate state in label selection.
 */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  'aria-label': string;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={onChange}
    />
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
  studentLabels: StaffStudentLabel[];
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
  | 'student_labels';

function StudentsCard({
  authzData,
  course,
  courseInstance,
  students: initialStudents,
  studentLabels: initialStudentLabels,
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
  const [studentLabelsFilter, setStudentLabelsFilter] = useQueryState(
    'student_labels',
    parseAsArrayOf(parseAsString).withDefault([]),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [newLabelName, setNewLabelName] = useState('');

  const { createCheckboxProps } = useShiftClickCheckbox<StudentRow>();

  const queryClient = useQueryClient();

  // Fetch student labels for batch actions
  const { data: studentLabels = initialStudentLabels } = useQuery({
    queryKey: ['student-labels', courseInstance.id],
    queryFn: async () => {
      const res = await fetch(
        `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students/labels/data.json`,
        {
          headers: { Accept: 'application/json' },
        },
      );
      if (!res.ok) throw new Error('Failed to fetch student labels');
      const data = await res.json();
      const labels = z.array(StudentLabelWithUserDataSchema).parse(data);
      return labels.map((l) => l.student_label);
    },
    staleTime: Infinity,
    initialData: initialStudentLabels,
  });

  // The individual column filters are the source of truth, and this is derived from them.
  const columnFilters: { id: ColumnId; value: any }[] = useMemo(() => {
    return [
      {
        id: 'enrollment_status',
        value: enrollmentStatusFilter,
      },
      {
        id: 'student_labels',
        value: studentLabelsFilter,
      },
    ];
  }, [enrollmentStatusFilter, studentLabelsFilter]);

  const columnFilterSetters = useMemo<Record<ColumnId, Updater<any>>>(() => {
    return {
      select: undefined,
      user_uid: undefined,
      user_name: undefined,
      enrollment_status: setEnrollmentStatusFilter,
      user_email: undefined,
      enrollment_first_joined_at: undefined,
      student_labels: setStudentLabelsFilter,
    };
  }, [setEnrollmentStatusFilter, setStudentLabelsFilter]);

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
  const batchAddToLabelMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      studentLabelId,
    }: {
      enrollmentIds: string[];
      studentLabelId: string;
    }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_add_to_label',
          __csrf_token: csrfToken,
          enrollment_ids: enrollmentIds,
          student_label_id: studentLabelId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to add to label');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
    },
  });

  const batchRemoveFromLabelMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      studentLabelId,
    }: {
      enrollmentIds: string[];
      studentLabelId: string;
    }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'batch_remove_from_label',
          __csrf_token: csrfToken,
          enrollment_ids: enrollmentIds,
          student_label_id: studentLabelId,
        }),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to remove from label');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
    },
  });

  const createLabelAndAddMutation = useMutation({
    mutationFn: async ({ enrollmentIds, name }: { enrollmentIds: string[]; name: string }) => {
      const res = await fetch(window.location.href, {
        method: 'POST',
        body: JSON.stringify({
          __action: 'create_label_and_add_students',
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
        throw new Error(json.error ?? 'Failed to create label and add students');
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      await queryClient.invalidateQueries({ queryKey: ['student-labels'] });
      setNewLabelName('');
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: 'select',
        header: ({ table }) => <SelectAllCheckbox table={table} />,
        cell: ({ row, table }) => {
          const uid = row.original.user?.uid ?? row.original.enrollment.pending_uid ?? 'student';
          return (
            <input
              type="checkbox"
              aria-label={`Select ${uid}`}
              {...createCheckboxProps(row, table)}
            />
          );
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

      columnHelper.accessor((row) => row.student_labels, {
        id: 'student_labels',
        meta: {
          label: 'Student Labels',
        },
        header: 'Labels',
        cell: (info) => {
          const labels = info.getValue();
          if (labels.length === 0) return '—';
          const labelsUrl = `/pl/course_instance/${courseInstance.id}/instructor/instance_admin/students/labels`;
          return (
            <div className="d-flex flex-wrap gap-1">
              {labels.map((label) => (
                <StudentLabelBadge
                  key={label.id}
                  label={label}
                  href={`${labelsUrl}?label=${encodeURIComponent(label.name)}`}
                />
              ))}
            </div>
          );
        },
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const studentLabelIds = new Set(
            row.getValue<StudentRow['student_labels']>(columnId).map((l) => l.id),
          );
          return filterValues.some((filterId) => studentLabelIds.has(filterId));
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
    [timezone, courseInstance.id, createCheckboxProps],
  );

  const allColumnIds = columns
    .map((col) => col.id)
    .filter((id): id is string => typeof id === 'string' && id !== 'select');
  const hiddenByDefault = new Set(['user_email']);
  const defaultColumnVisibility = Object.fromEntries(
    allColumnIds.map((id) => [id, !hiddenByDefault.has(id)]),
  );
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

  // Calculate selected enrollment IDs and common labels for batch actions
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedEnrollmentIds = selectedRows.map((row) => row.original.enrollment.id);

  // Calculate label membership state for each label: 'all', 'none', or 'some'
  const labelMembershipState = useMemo(() => {
    const states = new Map<string, 'all' | 'none' | 'some'>();

    if (selectedRows.length === 0) {
      studentLabels.forEach((l) => states.set(l.id, 'none'));
      return states;
    }

    studentLabels.forEach((label) => {
      const membersInLabel = selectedRows.filter((row) =>
        row.original.student_labels.some((l) => l.id === label.id),
      ).length;

      if (membersInLabel === 0) {
        states.set(label.id, 'none');
      } else if (membersInLabel === selectedRows.length) {
        states.set(label.id, 'all');
      } else {
        states.set(label.id, 'some');
      }
    });

    return states;
  }, [selectedRows, studentLabels]);

  // Check if any label mutation is pending
  const isLabelMutationPending =
    batchAddToLabelMutation.isPending ||
    batchRemoveFromLabelMutation.isPending ||
    createLabelAndAddMutation.isPending;
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

  // Combine mutation errors for display
  const labelMutationError =
    batchAddToLabelMutation.error ??
    batchRemoveFromLabelMutation.error ??
    createLabelAndAddMutation.error;

  return (
    <>
      {labelMutationError && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            batchAddToLabelMutation.reset();
            batchRemoveFromLabelMutation.reset();
            createLabelAndAddMutation.reset();
          }}
        >
          {labelMutationError instanceof Error
            ? labelMutationError.message
            : 'Failed to update label membership'}
        </Alert>
      )}
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
                  Labels
                </Dropdown.Toggle>
                <Dropdown.Menu style={{ minWidth: '220px' }}>
                  {studentLabels.map((label) => {
                    const state = labelMembershipState.get(label.id);
                    const isChecked = state === 'all';
                    const isIndeterminate = state === 'some';

                    return (
                      <Dropdown.Item
                        key={label.id}
                        as="label"
                        className="d-flex align-items-center gap-2"
                        style={{ cursor: isLabelMutationPending ? 'wait' : 'pointer' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IndeterminateCheckbox
                          checked={isChecked}
                          indeterminate={isIndeterminate}
                          disabled={isLabelMutationPending}
                          aria-label={`${isChecked ? 'Remove from' : 'Add to'} label "${label.name}"`}
                          onChange={() => {
                            if (isChecked) {
                              batchRemoveFromLabelMutation.mutate({
                                enrollmentIds: selectedEnrollmentIds,
                                studentLabelId: label.id,
                              });
                            } else {
                              batchAddToLabelMutation.mutate({
                                enrollmentIds: selectedEnrollmentIds,
                                studentLabelId: label.id,
                              });
                            }
                          }}
                        />
                        <span>{label.name}</span>
                      </Dropdown.Item>
                    );
                  })}
                  {studentLabels.length > 0 && <Dropdown.Divider />}
                  <Dropdown.Item
                    as="div"
                    className="p-2 bg-transparent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="d-flex gap-2 align-items-center">
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="e.g. Lab section 1"
                        aria-label="New label name"
                        value={newLabelName}
                        disabled={isLabelMutationPending}
                        onChange={(e) => setNewLabelName((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newLabelName.trim() && !isLabelMutationPending) {
                            e.preventDefault();
                            createLabelAndAddMutation.mutate({
                              enrollmentIds: selectedEnrollmentIds,
                              name: newLabelName,
                            });
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!newLabelName.trim() || isLabelMutationPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (newLabelName.trim()) {
                            createLabelAndAddMutation.mutate({
                              enrollmentIds: selectedEnrollmentIds,
                              name: newLabelName,
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
            student_labels: ({
              header,
            }: {
              header: Header<StudentRow, StudentRow['student_labels']>;
            }) => {
              const labelIds = studentLabels.map((l) => l.id);
              return (
                <MultiSelectColumnFilter
                  column={header.column as Column<StudentRow, unknown>}
                  allColumnValues={labelIds}
                  renderValueLabel={({ value }) => {
                    const label = studentLabels.find((l) => l.id === String(value));
                    if (!label) return <span>{String(value)}</span>;
                    return <span>{label.name}</span>;
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
  studentLabels,
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
          studentLabels={studentLabels}
          timezone={timezone}
          csrfToken={csrfToken}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
