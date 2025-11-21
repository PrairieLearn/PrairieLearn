import { QueryClient, useQuery } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type SortingState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { ButtonGroup, Dropdown } from 'react-bootstrap';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  type NumericColumnFilterValue,
  NumericInputColumnFilter,
  TanstackTableCard,
  numericColumnFilterFn,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsNumericFilter,
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

import { EditScoreButton } from './EditScoreModal.js';

const DEFAULT_SORT: SortingState = [{ id: 'role', desc: true }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['uid'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
const DEFAULT_ROLE_FILTER: (typeof ROLE_VALUES)[number][] = [];
type EnrollmentFilterOption = 'students-and-staff' | 'only-students' | 'only-joined-students';

const DEFAULT_ENROLLMENT_FILTER: EnrollmentFilterOption = 'only-joined-students';
const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);
const DEFAULT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const columnHelper = createColumnHelper<GradebookRow>();
const queryClient = new QueryClient();

/**
 * Recursively extracts leaf column IDs from column definitions.
 * Group columns are skipped, only actual data columns are included.
 */
function extractLeafColumnIds(columns: { id?: string | null; columns?: unknown[] }[]): string[] {
  const leafIds: string[] = [];
  for (const col of columns) {
    if (col.columns && Array.isArray(col.columns) && col.columns.length > 0) {
      // This is a group column, recurse into its children
      leafIds.push(...extractLeafColumnIds(col.columns as typeof columns));
    } else if (col.id) {
      // This is a leaf column
      leafIds.push(col.id);
    }
  }
  return leafIds;
}

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
  const tableRef = useRef<HTMLDivElement>(null);
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

  const assessmentFilterConfig = useMemo(() => {
    return Object.fromEntries(
      courseAssessments.map((assessment) => {
        const columnId = `a${assessment.assessment_id}`;
        return [columnId, parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false })];
      }),
    );
  }, [courseAssessments]);

  const [assessmentFilterValues, setAssessmentFilterValues] =
    useQueryStates(assessmentFilterConfig);

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

    Object.entries(assessmentFilterValues).forEach(([columnId, filterValue]) => {
      filters.push({ id: columnId, value: filterValue });
    });

    return filters;
  }, [enrollmentFilter, statusFilter, roleFilter, assessmentFilterValues]);

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

  const assessmentsBySet = useMemo(() => {
    const groups = new Map<string, CourseAssessmentRow[]>();
    const headingById = new Map<string, string>();
    courseAssessments.forEach((assessment) => {
      const id = assessment.assessment_set_id.toString();
      const list = groups.get(id) ?? [];
      list.push(assessment);
      groups.set(id, list);
      headingById.set(id, assessment.assessment_set_heading);
    });
    return { groups, headingById };
  }, [courseAssessments]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('uid', {
        id: 'uid',
        header: 'UID',
        cell: (info) => {
          const uid = info.getValue();
          // Staff may not have an enrollment
          const enrollmentId = info.row.original.enrollment?.id;
          if (!uid) return '—';
          if (!enrollmentId) return uid;
          return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{uid}</a>;
        },
      }),

      columnHelper.accessor('user_name', {
        id: 'user_name',
        header: 'Name',
        cell: (info) => {
          return info.getValue() ?? '—';
        },
      }),

      columnHelper.accessor('uin', {
        id: 'uin',
        header: 'UIN',
        cell: (info) => info.getValue() ?? '—',
      }),

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
          const current = row.getValue<EnumEnrollmentStatus | undefined>(columnId);
          // If there is no enrollment status, it doesn't match if any filter is set.
          if (!current) return false;
          return filterValues.includes(current);
        },
      }),

      // Dynamic assessment columns
      ...Array.from(assessmentsBySet.groups.entries()).map(([setId, assessments]) =>
        columnHelper.group({
          id: `group_${setId}`,
          header: assessmentsBySet.headingById.get(setId) ?? 'Unknown',
          columns: assessments.map((assessment) =>
            columnHelper.accessor(
              (row) => {
                const data = row.scores[assessment.assessment_id];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                return data ? data.score_perc : null;
              },
              {
                id: `a${assessment.assessment_id}`,
                minSize: 100,
                maxSize: 500,
                meta: {
                  label: assessment.label,
                },
                header: () => (
                  <a href={`${urlPrefix}/assessment/${assessment.assessment_id}`}>
                    <span
                      class={clsx('badge', `color-${assessment.color}`)}
                      title={assessment.label}
                    >
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

                  return (
                    <span class="text-nowrap">
                      <a
                        href={`${urlPrefix}/assessment_instance/${assessmentData.assessment_instance_id}`}
                      >
                        {Math.floor(score)}%
                      </a>
                      <EditScoreButton
                        assessmentInstanceId={assessmentData.assessment_instance_id}
                        currentScore={score}
                        otherUsers={assessmentData.uid_other_users_group}
                        csrfToken={csrfToken}
                      />
                    </span>
                  );
                },
                filterFn: numericColumnFilterFn,
              },
            ),
          ),
        }),
      ),
    ],
    [assessmentsBySet, urlPrefix, csrfToken],
  );

  // Extract only leaf column IDs (exclude group columns)
  const allColumnIds = extractLeafColumnIds(columns);

  // Set default visibility: hide UID, UIN, Role, and enrollment_status columns by default
  const defaultColumnVisibility = Object.fromEntries(
    allColumnIds.map((id) => {
      if (['user_name', 'uin', 'role', 'enrollment_status'].includes(id)) {
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
    const assessmentFilters: Record<
      string,
      (props: { header: Header<GradebookRow, unknown> }) => React.JSX.Element
    > = {};

    courseAssessments.forEach((assessment) => {
      const columnId = `a${assessment.assessment_id}`;
      assessmentFilters[columnId] = ({ header }: { header: Header<GradebookRow, unknown> }) => {
        const filterValue = assessmentFilterValues[columnId];

        return (
          <NumericInputColumnFilter
            columnId={header.column.id}
            columnLabel={assessment.label}
            value={filterValue}
            onChange={(value) => {
              void setAssessmentFilterValues((prev) => {
                const newValues: Record<string, NumericColumnFilterValue> = {
                  ...prev,
                  [columnId]: value,
                };
                return newValues;
              });
            }}
          />
        );
      };
    });

    return {
      role: ({ header }: { header: Header<GradebookRow, unknown> }) => (
        <CategoricalColumnFilter
          columnId={header.column.id}
          columnLabel="Role"
          allColumnValues={ROLE_VALUES}
          renderValueLabel={({ value }) => <span>{value}</span>}
          columnValuesFilter={roleFilter}
          setColumnValuesFilter={setRoleFilter}
        />
      ),
      enrollment_status: ({ header }: { header: Header<GradebookRow, unknown> }) => (
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
  }, [
    courseAssessments,
    roleFilter,
    setRoleFilter,
    statusFilter,
    setStatusFilter,
    assessmentFilterValues,
    setAssessmentFilterValues,
  ]);

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
        singularLabel="student"
        pluralLabel="students"
        // eslint-disable-next-line @eslint-react/no-forbidden-props
        className="h-100"
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
          scrollRef: tableRef,
        }}
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
