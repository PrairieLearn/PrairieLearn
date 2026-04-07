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
import { useMemo, useState } from 'react';
import { Alert, Button, ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';
import z from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { run } from '@prairielearn/run';
import {
  CategoricalColumnFilter,
  IndeterminateCheckbox,
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
  getCourseInstanceStudentLabelsUrl,
  getSelfEnrollmentLinkUrl,
  getSelfEnrollmentSettingsUrl,
  getStudentCourseInstanceUrl,
  getStudentEnrollmentUrl,
} from '../../lib/client/url.js';
import type { EnumEnrollmentStatus } from '../../lib/db-types.js';
import { courseInstanceFilenamePrefix } from '../../lib/sanitize-name.js';
import { createCourseInstanceTrpcClient } from '../../trpc/courseInstance/client.js';
import { MAX_LABEL_UIDS } from '../instructorStudentsLabels/instructorStudentsLabels.types.js';

import { InviteStudentsModal } from './components/InviteStudentsModal.js';
import { SyncStudentsModal } from './components/SyncStudentsModal.js';
import { STATUS_VALUES, type StudentRow, StudentRowSchema } from './instructorStudents.shared.js';

function SelectAllCheckbox({ table }: { table: Table<StudentRow> }) {
  return (
    <IndeterminateCheckbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected()}
      aria-label="Select all students"
      onChange={() => table.toggleAllPageRowsSelected()}
    />
  );
}

// These defaults must be declared outside the component to ensure referential
// stability across renders, as `[] !== []` in JavaScript.
const DEFAULT_SORT: SortingState = [{ id: 'user_uid', desc: false }];

const DEFAULT_PINNING: ColumnPinningState = { left: ['select', 'user_uid'], right: [] };

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
      {courseInstance.self_enrollment_enabled &&
        courseInstance.self_enrollment_use_enrollment_code && (
          <OverlayTrigger
            placement="right"
            tooltip={{
              body: copiedCode ? 'Copied!' : 'Copy',
              props: { id: 'students-copy-code-tooltip' },
            }}
            show={copiedCode ? true : undefined}
          >
            <Dropdown.Item as="button" type="button" onClick={handleCopyCode}>
              <i className="bi bi-key me-2" aria-hidden="true" />
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
            <i className="bi bi-link-45deg me-2" aria-hidden="true" />
            Copy enrollment link
          </Dropdown.Item>
        </OverlayTrigger>
      )}
      <Dropdown.Item as="a" href={getSelfEnrollmentSettingsUrl(courseInstance.id)}>
        <i className="bi bi-gear me-2" aria-hidden="true" />
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
  trpcCsrfToken: string;
  origHash: string | null;
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
  trpcCsrfToken,
  origHash: initialOrigHash,
}: StudentsCardProps) {
  const [origHash, setOrigHash] = useState(initialOrigHash);
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

  const { createCheckboxProps } = useShiftClickCheckbox<StudentRow>();

  const queryClient = useQueryClient();
  const [trpcClient] = useState(() =>
    createCourseInstanceTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
    }),
  );

  const { data: studentLabels = initialStudentLabels } = useQuery({
    queryKey: ['student-labels', courseInstance.id],
    queryFn: async () => {
      const result = await trpcClient.studentLabels.listDefinitions.query();
      setOrigHash(result.origHash);
      return result.labels;
    },
    staleTime: Infinity,
    initialData: initialStudentLabels,
  });

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

  const [labelMutationSuccess, setLabelMutationSuccess] = useState<string | null>(null);

  const batchAddLabelMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      labelId,
      labelName: _labelName,
    }: {
      enrollmentIds: string[];
      labelId: string;
      labelName: string;
    }) => {
      return await trpcClient.studentLabels.batchAdd.mutate({ enrollmentIds, labelId });
    },
    onSuccess: async (result, { labelName }) => {
      const parts: string[] = [
        `Added label "${labelName}" to ${result.added} student${result.added !== 1 ? 's' : ''}.`,
      ];
      if (result.alreadyHaveLabel > 0) {
        parts.push(`${result.alreadyHaveLabel} already had the label "${labelName}".`);
      }
      if (result.notFound > 0) {
        parts.push(`${result.notFound} not found.`);
      }
      setLabelMutationSuccess(parts.join(' '));
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      await queryClient.invalidateQueries({ queryKey: ['student-labels'] });
    },
  });

  const batchRemoveLabelMutation = useMutation({
    mutationFn: async ({
      enrollmentIds,
      labelId,
      labelName: _labelName,
    }: {
      enrollmentIds: string[];
      labelId: string;
      labelName: string;
    }) => {
      return await trpcClient.studentLabels.batchRemove.mutate({ enrollmentIds, labelId });
    },
    onSuccess: async (result, { labelName }) => {
      const parts: string[] = [
        `Removed label "${labelName}" from ${result.removed} student${result.removed !== 1 ? 's' : ''}.`,
      ];
      if (result.didNotHaveLabel > 0) {
        parts.push(`${result.didNotHaveLabel} did not have the label.`);
      }
      if (result.notFound > 0) {
        parts.push(`${result.notFound} not found.`);
      }
      setLabelMutationSuccess(parts.join(' '));
      await queryClient.invalidateQueries({ queryKey: ['enrollments', 'students'] });
      await queryClient.invalidateQueries({ queryKey: ['student-labels'] });
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

      columnHelper.accessor((row) => row.student_label_ids, {
        id: 'student_labels',
        meta: {
          label: 'Student labels',
        },
        header: 'Labels',
        cell: (info) => {
          const labelIds = info.getValue();
          if (labelIds.length === 0) return '—';
          const labelsUrl = getCourseInstanceStudentLabelsUrl(courseInstance.id);
          const labels = labelIds
            .map((id) => studentLabels.find((l) => l.id === id))
            .filter((l): l is StaffStudentLabel => l != null);
          return (
            <div className="d-flex flex-wrap gap-1">
              {labels.map((label) => (
                <StudentLabelBadge key={label.id} label={label} href={labelsUrl} />
              ))}
            </div>
          );
        },
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const labelIdSet = new Set(row.getValue<StudentRow['student_label_ids']>(columnId));
          return filterValues.some((filterId) => labelIdSet.has(filterId));
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
    [timezone, courseInstance.id, createCheckboxProps, studentLabels],
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

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const selectedEnrollmentIds = selectedRows.map((row) => row.original.enrollment.id);

  const labelAssignmentState = useMemo(() => {
    const states = new Map<string, 'all' | 'none' | 'some'>();

    if (selectedRows.length === 0) {
      studentLabels.forEach((l) => states.set(l.id, 'none'));
      return states;
    }

    studentLabels.forEach((label) => {
      const studentsWithLabel = selectedRows.filter((row) =>
        row.original.student_label_ids.includes(label.id),
      ).length;

      if (studentsWithLabel === 0) {
        states.set(label.id, 'none');
      } else if (studentsWithLabel === selectedRows.length) {
        states.set(label.id, 'all');
      } else {
        states.set(label.id, 'some');
      }
    });

    return states;
  }, [selectedRows, studentLabels]);

  const tooManySelectedForLabels = selectedEnrollmentIds.length > MAX_LABEL_UIDS;
  const isLabelMutationPending =
    batchAddLabelMutation.isPending || batchRemoveLabelMutation.isPending;
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

  const labelMutationError = batchAddLabelMutation.error ?? batchRemoveLabelMutation.error;

  return (
    <>
      {labelMutationSuccess && (
        <Alert variant="success" dismissible onClose={() => setLabelMutationSuccess(null)}>
          {labelMutationSuccess}
        </Alert>
      )}
      {labelMutationError && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            batchAddLabelMutation.reset();
            batchRemoveLabelMutation.reset();
          }}
        >
          {labelMutationError instanceof Error
            ? labelMutationError.message
            : 'Failed to update student labels'}
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
            {authzData.has_course_instance_permission_edit &&
              origHash !== null &&
              selectedEnrollmentIds.length > 0 && (
                <Dropdown autoClose="outside">
                  {tooManySelectedForLabels ? (
                    <OverlayTrigger
                      tooltip={{
                        body: `Select at most ${MAX_LABEL_UIDS} students to apply labels.`,
                        props: { id: 'students-label-limit-tooltip' },
                      }}
                    >
                      <Dropdown.Toggle variant="light" size="sm" disabled>
                        Labels
                      </Dropdown.Toggle>
                    </OverlayTrigger>
                  ) : (
                    <Dropdown.Toggle variant="light" size="sm">
                      Labels
                    </Dropdown.Toggle>
                  )}
                  <Dropdown.Menu style={{ minWidth: '220px' }}>
                    {studentLabels.map((label) => {
                      const state = labelAssignmentState.get(label.id);
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
                            disabled={isLabelMutationPending || tooManySelectedForLabels}
                            aria-label={`${isChecked ? 'Remove' : 'Add'} label "${label.name}" ${isChecked ? 'from' : 'to'} selected students`}
                            onChange={() => {
                              if (isChecked) {
                                batchRemoveLabelMutation.mutate({
                                  enrollmentIds: selectedEnrollmentIds,
                                  labelId: label.id,
                                  labelName: label.name,
                                });
                              } else {
                                batchAddLabelMutation.mutate({
                                  enrollmentIds: selectedEnrollmentIds,
                                  labelId: label.id,
                                  labelName: label.name,
                                });
                              }
                            }}
                          />
                          <span>{label.name}</span>
                        </Dropdown.Item>
                      );
                    })}
                    <Dropdown.Divider />
                    <Dropdown.Item
                      as="a"
                      href={getCourseInstanceStudentLabelsUrl(courseInstance.id)}
                    >
                      <i className="bi bi-gear me-2" />
                      {authzData.has_course_permission_edit ? 'Manage labels' : 'View labels'}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}
            {courseInstance.modern_publishing && (
              <ManageEnrollmentsDropdown
                courseInstance={courseInstance}
                authzData={authzData}
                onInvite={() => setShowInvite(true)}
                onSync={() => {
                  // Reload the latest student data so that the preview of sync actions
                  // will be as accurate as possible.
                  void queryClient
                    .invalidateQueries({ queryKey: ['enrollments', 'students'] })
                    .then(() => {
                      setShowSync(true);
                    });
                }}
              />
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
              header: Header<StudentRow, StudentRow['student_label_ids']>;
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
  trpcCsrfToken,
  origHash,
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
          trpcCsrfToken={trpcCsrfToken}
          origHash={origHash}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
};
InstructorStudents.displayName = 'InstructorStudents';
