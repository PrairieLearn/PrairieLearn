import { QueryClient, useQuery } from '@tanstack/react-query';
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
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'preact/compat';
import { ButtonGroup, Dropdown } from 'react-bootstrap';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  NumericInputColumnFilter,
  TanstackTableCard,
  numericColumnFilterFnWithEmpty,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../../lib/client/nuqs.js';
import type { PageContextWithAuthzData } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type EnumEnrollmentStatus, EnumEnrollmentStatusSchema } from '../../../lib/db-types.js';
import {
  type CourseAssessmentRow,
  type GradebookRow,
  GradebookRowSchema,
} from '../instructorGradebook.types.js';

import { EditScoreModal } from './EditScoreModal.js';

const DEFAULT_SORT: SortingState = [{ id: 'role', desc: true }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['user_name'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
const DEFAULT_ROLE_FILTER: (typeof ROLE_VALUES)[number][] = [];
type EnrollmentFilterOption = 'students-and-staff' | 'only-students' | 'only-joined-students';

const DEFAULT_ENROLLMENT_FILTER: EnrollmentFilterOption = 'only-joined-students';
const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);
const DEFAULT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const columnHelper = createColumnHelper<GradebookRow>();
const queryClient = new QueryClient();

interface GradebookTableProps {
  authzData: PageContextWithAuthzData['authz_data'];
  csrfToken: string;
  courseAssessments: CourseAssessmentRow[];
  gradebookRows: GradebookRow[];
  urlPrefix: string;
  csvFilename: string;
}

function GradebookTable({
  authzData: _authzData,
  csrfToken,
  courseAssessments,
  gradebookRows: initialGradebookRows,
  urlPrefix,
  csvFilename,
}: GradebookTableProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );
  const [roleFilter, setRoleFilter] = useQueryState<(typeof ROLE_VALUES)[number][]>(
    'role',
    parseAsArrayOf(parseAsStringLiteral(ROLE_VALUES)).withDefault(DEFAULT_ROLE_FILTER),
  );

  const [enrollmentFilter, setEnrollmentFilter] =
    useState<EnrollmentFilterOption>(DEFAULT_ENROLLMENT_FILTER);
  const [statusFilter, setStatusFilter] = useQueryState<EnumEnrollmentStatus[]>(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(DEFAULT_STATUS_FILTER),
  );

  const [editScoreModal, setEditScoreModal] = useState<{
    show: boolean;
    assessmentInstanceId: string;
    currentScore: number;
    otherUsers: string[];
  }>({
    show: false,
    assessmentInstanceId: '',
    currentScore: 0,
    otherUsers: [],
  });

  // The individual column filters are the source of truth, and this is derived from them.
  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];

    // Apply status filter
    if (statusFilter.length > 0) {
      filters.push({ id: 'enrollment_status', value: statusFilter });
    }

    // Apply role filter from role column filter
    if (roleFilter.length > 0) {
      filters.push({ id: 'role', value: roleFilter });
    }

    // Apply enrollment filter based on selection
    if (enrollmentFilter === 'only-joined-students') {
      filters.push({ id: 'enrollment_status', value: ['joined'] });
    } else if (enrollmentFilter === 'only-students') {
      filters.push({ id: 'role', value: ['Student'] });
    }
    // 'students-and-staff' shows everyone, no filter

    return filters;
  }, [enrollmentFilter, statusFilter, roleFilter]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const { data: gradebookRows } = useQuery<GradebookRow[]>({
    queryKey: ['gradebook', urlPrefix],
    queryFn: async () => {
      const res = await fetch(`${urlPrefix}/instance_admin/gradebook/raw_data.json`);
      if (!res.ok) throw new Error('Failed to fetch gradebook data');
      const data = await res.json();
      const parsedData = z.array(GradebookRowSchema).safeParse(data);
      if (!parsedData.success) throw new Error('Failed to parse gradebook data');
      return parsedData.data;
    },
    refetchInterval: 30000, // 30 seconds
    staleTime: 0,
    initialData: initialGradebookRows,
  });

  const columns = useMemo(
    () => [
      // Name column (pinned left by default)
      columnHelper.accessor('user_name', {
        id: 'user_name',
        header: 'Name',
        cell: (info) => {
          const name = info.getValue();
          const enrollmentId = info.row.original.enrollment?.id;
          if (!name) return '—';
          if (!enrollmentId) return name;
          return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{name}</a>;
        },
      }),

      // UID column
      columnHelper.accessor('uid', {
        id: 'uid',
        header: 'UID',
        cell: (info) => info.getValue(),
      }),

      // UIN column
      columnHelper.accessor('uin', {
        id: 'uin',
        header: 'UIN',
        cell: (info) => info.getValue() || '—',
      }),

      // Role column
      columnHelper.accessor('role', {
        id: 'role',
        meta: {
          label: 'Role',
        },
        header: () => (
          <span>
            Role{' '}
            <button
              class="btn btn-xs btn-ghost"
              type="button"
              aria-label="Roles help"
              data-bs-toggle="modal"
              data-bs-target="#role-help"
              onClick={(e) => e.stopPropagation()}
            >
              <i class="bi-question-circle-fill" aria-hidden="true" />
            </button>
          </span>
        ),
        cell: (info) => info.getValue(),
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const current = row.getValue<GradebookRow['role']>(columnId);
          return filterValues.includes(current);
        },
      }),

      // Enrollment Status column
      columnHelper.accessor((row) => row.enrollment?.status, {
        id: 'enrollment_status',
        header: 'Status',
        cell: (info) => {
          const status = info.getValue();
          return status ? <EnrollmentStatusIcon type="text" status={status} /> : '—';
        },
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const current = row.getValue(columnId);
          if (typeof current !== 'string') return false;
          return filterValues.includes(current);
        },
      }),

      // Dynamic assessment columns
      ...courseAssessments.map((assessment) =>
        columnHelper.accessor(
          (row) => {
            const data = row.scores[assessment.assessment_id];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            return data ? data.score_perc : null;
          },
          {
            id: `assessment_${assessment.assessment_id}`,
            size: 100,
            minSize: 100,
            maxSize: 120,
            meta: {
              label: assessment.label,
            },
            header: () => (
              <a
                href={`${urlPrefix}/assessment/${assessment.assessment_id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <span class={`badge color-${assessment.color}`} title={assessment.label}>
                  {assessment.label}
                </span>
              </a>
            ),
            cell: (info) => {
              const score = info.getValue();
              const row = info.row.original;
              const assessmentData = row.scores[assessment.assessment_id];

              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              if (score == null || !assessmentData?.assessment_instance_id) {
                return '—';
              }

              const editButton = (
                <button
                  type="button"
                  class="btn btn-xs btn-ghost edit-score ms-1"
                  aria-label="Edit score"
                  onClick={() =>
                    setEditScoreModal({
                      show: true,
                      assessmentInstanceId: assessmentData.assessment_instance_id!,
                      currentScore: score,
                      otherUsers: assessmentData.uid_other_users_group,
                    })
                  }
                >
                  <i class="bi-pencil-square" aria-hidden="true" />
                </button>
              );

              return (
                <span class="text-nowrap">
                  <a
                    href={`${urlPrefix}/assessment_instance/${assessmentData.assessment_instance_id}`}
                  >
                    {Math.floor(score)}%
                  </a>
                  {editButton}
                </span>
              );
            },
            filterFn: numericColumnFilterFnWithEmpty,
          },
        ),
      ),
    ],
    [courseAssessments, urlPrefix],
  );

  const allColumnIds = columns.map((col) => col.id).filter((id) => typeof id === 'string');

  // Set default visibility: hide UID, UIN, Role, and enrollment_status columns by default
  const defaultColumnVisibility = Object.fromEntries(
    allColumnIds.map((id) => {
      if (id === 'uid' || id === 'uin' || id === 'role' || id === 'enrollment_status') {
        return [id, false];
      }
      return [id, true];
    }),
  );

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  useEffect(() => {
    if (enrollmentFilter === 'only-joined-students') {
      void setColumnVisibility((prev) => ({ ...prev, role: false, enrollment_status: false }));
    } else if (enrollmentFilter === 'only-students') {
      void setColumnVisibility((prev) => ({ ...prev, enrollment_status: true, role: false }));
    } else {
      // students-and-staff: Show both
      void setColumnVisibility((prev) => ({ ...prev, role: true, enrollment_status: true }));
    }
  }, [enrollmentFilter, setColumnVisibility]);

  // Create filters for assessment columns
  const filters = useMemo(() => {
    const assessmentFilters: Record<string, (props: { header: any }) => React.JSX.Element> = {};

    courseAssessments.forEach((assessment) => {
      const columnId = `assessment_${assessment.assessment_id}`;
      assessmentFilters[columnId] = ({ header }: { header: any }) => {
        const filterValue = header.column.getFilterValue() as
          | string
          | { numeric: string; emptyOnly: boolean }
          | undefined;
        const numericValue =
          typeof filterValue === 'string' ? filterValue : filterValue?.numeric || '';
        const emptyOnly = typeof filterValue === 'object' ? filterValue.emptyOnly : false;

        return (
          <NumericInputColumnFilter
            columnId={header.column.id}
            columnLabel={assessment.label}
            value={numericValue}
            emptyFilterChecked={emptyOnly}
            allowEmptyFilter
            onChange={(value) => {
              // When typing in the input, always set as string (not object)
              // This allows the input to work normally
              // Set to undefined only if completely empty, otherwise keep the string even if incomplete
              header.column.setFilterValue(value === '' ? undefined : value);
            }}
            onEmptyFilterChange={(checked) => {
              const newFilter = checked ? { numeric: '', emptyOnly: true } : undefined;
              header.column.setFilterValue(newFilter);
            }}
          />
        );
      };
    });

    return {
      role: ({ header }: { header: any }) => (
        <CategoricalColumnFilter
          columnId={header.column.id}
          columnLabel="Role"
          allColumnValues={ROLE_VALUES}
          renderValueLabel={({ value }) => <span>{value}</span>}
          columnValuesFilter={roleFilter}
          setColumnValuesFilter={setRoleFilter}
        />
      ),
      enrollment_status: ({ header }: { header: any }) => (
        <CategoricalColumnFilter
          columnId={header.column.id}
          columnLabel="Status"
          allColumnValues={STATUS_VALUES}
          renderValueLabel={({ value }) => <EnrollmentStatusIcon type="text" status={value} />}
          columnValuesFilter={statusFilter}
          setColumnValuesFilter={setStatusFilter}
        />
      ),
      ...assessmentFilters,
    };
  }, [courseAssessments, roleFilter, setRoleFilter, statusFilter, setStatusFilter]);

  const table = useReactTable({
    data: gradebookRows,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.user_id,
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
      minSize: 100,
      size: 150,
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
        title="Gradebook"
        pluralLabel="students"
        headerButtons={
          <button
            type="button"
            class="btn btn-sm btn-light"
            onClick={() => {
              window.location.href = `${urlPrefix}/instance_admin/gradebook/${csvFilename}`;
            }}
          >
            <i class="fa fa-download" aria-hidden="true" /> Download
          </button>
        }
        columnManagerButtons={
          <Dropdown as={ButtonGroup}>
            <Dropdown.Toggle variant="outline-secondary">
              <i class="bi bi-funnel me-2" aria-hidden="true" />
              Filter:{' '}
              {enrollmentFilter === 'students-and-staff'
                ? 'Students & Staff'
                : enrollmentFilter === 'only-students'
                  ? 'Students'
                  : 'Joined Students'}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item
                as="button"
                type="button"
                active={enrollmentFilter === 'only-joined-students'}
                onClick={() => setEnrollmentFilter('only-joined-students')}
              >
                <i
                  class={`bi ${enrollmentFilter === 'only-joined-students' ? 'bi-check-circle-fill' : 'bi-circle'} me-2`}
                />
                Only joined students
              </Dropdown.Item>
              <Dropdown.Item
                as="button"
                type="button"
                active={enrollmentFilter === 'only-students'}
                onClick={() => setEnrollmentFilter('only-students')}
              >
                <i
                  class={`bi ${enrollmentFilter === 'only-students' ? 'bi-check-circle-fill' : 'bi-circle'} me-2`}
                />
                Only students
              </Dropdown.Item>
              <Dropdown.Item
                as="button"
                type="button"
                active={enrollmentFilter === 'students-and-staff'}
                onClick={() => setEnrollmentFilter('students-and-staff')}
              >
                <i
                  class={`bi ${enrollmentFilter === 'students-and-staff' ? 'bi-check-circle-fill' : 'bi-circle'} me-2`}
                />
                Students and staff
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        }
        globalFilter={{
          value: globalFilter,
          setValue: setGlobalFilter,
          placeholder: 'Search by UID, name...',
        }}
        tableOptions={{
          filters,
        }}
      />
      <EditScoreModal
        show={editScoreModal.show}
        assessmentInstanceId={editScoreModal.assessmentInstanceId}
        currentScore={editScoreModal.currentScore}
        otherUsers={editScoreModal.otherUsers}
        csrfToken={csrfToken}
        onHide={() => setEditScoreModal({ ...editScoreModal, show: false })}
      />
    </>
  );
}

/**
 * Wrapper component for GradebookTable with React Query and NuqsAdapter
 */
export function InstructorGradebookTable({
  authzData,
  csrfToken,
  courseAssessments,
  gradebookRows,
  urlPrefix,
  csvFilename,
  search,
  isDevMode,
}: {
  authzData: PageContextWithAuthzData['authz_data'];
  search: string;
  isDevMode: boolean;
} & GradebookTableProps) {
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <GradebookTable
          authzData={authzData}
          csrfToken={csrfToken}
          courseAssessments={courseAssessments}
          gradebookRows={gradebookRows}
          urlPrefix={urlPrefix}
          csvFilename={csvFilename}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorGradebookTable.displayName = 'InstructorGradebookTable';
