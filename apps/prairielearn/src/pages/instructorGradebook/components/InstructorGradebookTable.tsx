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
import clsx from 'clsx';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  type NumericColumnFilterValue,
  NumericInputColumnFilter,
  NuqsAdapter,
  PresetFilterDropdown,
  TanstackTableCard,
  type TanstackTableCsvCell,
  numericColumnFilterFn,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsNumericFilter,
  parseAsSortingState,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type EnumEnrollmentStatus, EnumEnrollmentStatusSchema } from '../../../lib/db-types.js';
import {
  type CourseAssessmentRow,
  type GradebookRow,
  GradebookRowSchema,
} from '../instructorGradebook.types.js';

import { EditScoreButton } from './EditScoreModal.js';

const DEFAULT_SORT: SortingState = [{ id: 'uid', desc: false }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['uid'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
const DEFAULT_ROLE_FILTER: (typeof ROLE_VALUES)[number][] = ['Student'];
const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);
const DEFAULT_STATUS_FILTER: EnumEnrollmentStatus[] = ['joined'];

const columnHelper = createColumnHelper<GradebookRow>();

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

type ColumnId = 'uid' | 'user_name' | 'uin' | 'role' | 'enrollment_status' | `a${number}`;

interface GradebookTableProps {
  csrfToken: string;
  courseAssessments: CourseAssessmentRow[];
  gradebookRows: GradebookRow[];
  urlPrefix: string;
  courseInstanceId: string;
  filenameBase: string;
}

function GradebookTable({
  csrfToken,
  courseAssessments,
  gradebookRows: initialGradebookRows,
  urlPrefix,
  courseInstanceId,
  filenameBase,
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
  const [statusFilter, setStatusFilter] = useQueryState<EnumEnrollmentStatus[]>(
    'status',
    parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(DEFAULT_STATUS_FILTER),
  );

  const assessmentIds = useMemo(() => {
    return courseAssessments.map((assessment) => assessment.assessment_id);
  }, [courseAssessments]);

  const defaultAssessmentFilterValues = useMemo(() => {
    return Object.fromEntries(
      assessmentIds.map((id) => [
        `a${id}`,
        parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
      ]),
    );
  }, [assessmentIds]);

  const [assessmentFilterValues, setAssessmentFilterValues] = useQueryStates(
    defaultAssessmentFilterValues,
  );

  // We keep a consistent interface for the column filter setters, but we don't need to pass the column ID to the setters
  // other than the assessment filters.
  const columnFilterSetters = useMemo<Record<ColumnId, Updater<any>>>(() => {
    return {
      uid: undefined,
      user_name: undefined,
      uin: undefined,
      role: (_columnId: string, value: GradebookRow['role'][]) => setRoleFilter(value),
      enrollment_status: (_columnId: string, value: EnumEnrollmentStatus[]) =>
        setStatusFilter(value),
      ...Object.fromEntries(
        assessmentIds.map((assessmentId) => [
          `a${assessmentId}`,
          (columnId: string, value: NumericColumnFilterValue) =>
            setAssessmentFilterValues((prev) => {
              const newValues: Record<string, NumericColumnFilterValue> = {
                ...prev,
                [columnId]: value,
              };
              return newValues;
            }),
        ]),
      ),
    };
  }, [assessmentIds, setAssessmentFilterValues, setRoleFilter, setStatusFilter]);

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

    Object.entries(assessmentFilterValues).forEach(([columnId, filterValue]) => {
      filters.push({ id: columnId, value: filterValue });
    });

    return filters;
  }, [statusFilter, roleFilter, assessmentFilterValues]);

  // Sync TanStack column filter changes back to URL
  const handleColumnFiltersChange = useMemo(
    () => (updaterOrValue: Updater<ColumnFiltersState>) => {
      const newFilters =
        typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      for (const filter of newFilters) {
        columnFilterSetters[filter.id as ColumnId]?.(filter.id, filter.value);
      }
    },
    [columnFilters, columnFilterSetters],
  );

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
    staleTime: Infinity,
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
          return <a href={getStudentEnrollmentUrl(courseInstanceId, enrollmentId)}>{uid}</a>;
        },
        size: 200,
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
              className="btn btn-xs btn-ghost"
              type="button"
              aria-label="Roles help"
              data-bs-toggle="modal"
              data-bs-target="#role-help"
              onClick={(e) => e.stopPropagation()}
            >
              <i className="bi-question-circle-fill" aria-hidden="true" />
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
        header: 'Enrollment',
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
                minSize: 80,
                maxSize: 500,
                meta: {
                  label: assessment.label,
                  autoSize: true,
                },
                header: () => (
                  <a href={`${urlPrefix}/assessment/${assessment.assessment_id}`}>
                    <span
                      className={clsx('badge', `color-${assessment.color}`)}
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
                    <span className="text-nowrap">
                      <a
                        href={`${urlPrefix}/assessment_instance/${assessmentData.assessment_instance_id}`}
                      >
                        {Math.floor(score)}%
                      </a>
                      <EditScoreButton
                        assessmentInstanceId={assessmentData.assessment_instance_id}
                        courseInstanceId={courseInstanceId}
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
    [assessmentsBySet.groups, assessmentsBySet.headingById, urlPrefix, courseInstanceId, csrfToken],
  );

  // Extract only leaf column IDs (exclude group columns)
  const allColumnIds = extractLeafColumnIds(columns);

  // Set default visibility: hide name, UIN, role, and enrollment status columns by default
  const defaultColumnVisibility = Object.fromEntries(
    allColumnIds.map((id) => {
      if (['uin', 'role', 'enrollment_status'].includes(id)) {
        return [id, false];
      }
      return [id, true];
    }),
  );

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  const handleEnrollmentFilterSelect = (
    optionName: 'All students' | 'All students & staff' | 'Joined students',
  ) => {
    if (optionName === 'All students') {
      void setColumnVisibility((prev) => ({ ...prev, role: false, enrollment_status: true }));
    } else if (optionName === 'All students & staff') {
      void setColumnVisibility((prev) => ({ ...prev, enrollment_status: true, role: true }));
    } else {
      void setColumnVisibility((prev) => ({ ...prev, role: false, enrollment_status: false }));
    }
  };

  // Create filters for assessment columns
  const filters = useMemo(() => {
    const assessmentFilters: Record<
      string,
      (props: { header: Header<GradebookRow, unknown> }) => React.ReactNode
    > = {};

    courseAssessments.forEach((assessment) => {
      const columnId = `a${assessment.assessment_id}`;
      assessmentFilters[columnId] = ({ header }: { header: Header<GradebookRow, unknown> }) => {
        return <NumericInputColumnFilter column={header.column} />;
      };
    });

    return {
      role: ({ header }: { header: Header<GradebookRow, GradebookRow['role']> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={ROLE_VALUES}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      enrollment_status: ({ header }: { header: Header<GradebookRow, EnumEnrollmentStatus> }) => (
        <CategoricalColumnFilter
          column={header.column}
          allColumnValues={STATUS_VALUES}
          renderValueLabel={({ value }) => <EnrollmentStatusIcon type="text" status={value} />}
        />
      ),
      ...assessmentFilters,
    };
  }, [courseAssessments]);

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
    onColumnFiltersChange: handleColumnFiltersChange,
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
        singularLabel="user"
        pluralLabel="users"
        className="h-100"
        downloadButtonOptions={{
          filenameBase,
          mapRowToData: (row: GradebookRow) => {
            const data: TanstackTableCsvCell[] = [
              { name: 'UID', value: row.uid },
              { name: 'Name', value: row.user_name },
              { name: 'UIN', value: row.uin },
              { name: 'Role', value: row.role },
              { name: 'Enrollment', value: row.enrollment?.status ?? null },
            ];
            for (const assessment of courseAssessments) {
              data.push({
                name: assessment.label,
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                value: row.scores[assessment.assessment_id]?.score_perc ?? null,
              });
            }
            return data;
          },
          pluralLabel: "users' grades",
          singularLabel: "user's grades",
          hasSelection: false,
        }}
        columnManager={{
          buttons: (
            <PresetFilterDropdown
              table={table}
              label="Filter"
              options={{
                'Joined students': [
                  { id: 'enrollment_status', value: ['joined'] },
                  { id: 'role', value: ['Student'] },
                ],
                'All students': [{ id: 'role', value: ['Student'] }],
                'All students & staff': [],
              }}
              onSelect={handleEnrollmentFilterSelect}
            />
          ),
        }}
        globalFilter={{
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

export function InstructorGradebookTable({
  csrfToken,
  courseAssessments,
  gradebookRows,
  urlPrefix,
  filenameBase,
  search,
  isDevMode,
  courseInstanceId,
}: {
  search: string;
  isDevMode: boolean;
  courseInstanceId: string;
} & GradebookTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <GradebookTable
          csrfToken={csrfToken}
          courseAssessments={courseAssessments}
          gradebookRows={gradebookRows}
          urlPrefix={urlPrefix}
          filenameBase={filenameBase}
          courseInstanceId={courseInstanceId}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorGradebookTable.displayName = 'InstructorGradebookTable';
