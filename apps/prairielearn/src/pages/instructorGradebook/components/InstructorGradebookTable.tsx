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
import * as React from 'preact/compat';
import { useMemo, useState } from 'preact/compat';
import { z } from 'zod';

import { CategoricalColumnFilter, TanstackTableCard } from '@prairielearn/ui';

import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsSortingState,
} from '../../../lib/client/nuqs.js';
import type { PageContextWithAuthzData } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import {
  type CourseAssessmentRow,
  type GradebookRow,
  GradebookRowSchema,
} from '../instructorGradebook.types.js';

import { EditScoreModal } from './EditScoreModal.js';

const DEFAULT_SORT: SortingState = [{ id: 'role', desc: true }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['uid'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
const DEFAULT_ROLE_FILTER: (typeof ROLE_VALUES)[number][] = [];

const columnHelper = createColumnHelper<GradebookRow>();

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

  const [studentsOnlyFilter, setStudentsOnlyFilter] = useState(false);
  const [hideEmptyAssessments, setHideEmptyAssessments] = useState(false);

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

    // Apply role filter
    if (roleFilter.length > 0) {
      filters.push({ id: 'role', value: roleFilter });
    }

    // Apply "Students Only" filter if enabled
    if (studentsOnlyFilter) {
      filters.push({ id: 'role', value: ['Student'] });
    }

    return filters;
  }, [roleFilter, studentsOnlyFilter]);

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
      // UID column (pinned left by default)
      columnHelper.accessor('uid', {
        id: 'uid',
        header: 'UID',
        cell: (info) => info.getValue(),
        enableHiding: false,
      }),

      // UIN column
      columnHelper.accessor('uin', {
        id: 'uin',
        header: 'UIN',
        cell: (info) => info.getValue() || '—',
      }),

      // Name column
      columnHelper.accessor('user_name', {
        id: 'user_name',
        header: 'Name',
        cell: (info) => {
          const name = info.getValue();
          const enrollmentId = info.row.original.enrollment_id;
          if (!name) return '—';
          if (!enrollmentId) return name;
          return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{name}</a>;
        },
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
            enableColumnFilter: false,
          },
        ),
      ),
    ],
    [courseAssessments, urlPrefix],
  );

  const allColumnIds = columns.map((col) => col.id).filter((id) => typeof id === 'string');
  const defaultColumnVisibility = Object.fromEntries(allColumnIds.map((id) => [id, true]));

  // Determine which assessment columns have no scores for any student
  const emptyAssessmentColumns = useMemo(() => {
    const empty = new Set<string>();
    courseAssessments.forEach((assessment) => {
      const hasAnyScore = gradebookRows.some((row) => {
        const data = row.scores[assessment.assessment_id];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return data?.score_perc != null;
      });
      if (!hasAnyScore) {
        empty.add(`assessment_${assessment.assessment_id}`);
      }
    });
    return empty;
  }, [courseAssessments, gradebookRows]);

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  // Update column visibility when hideEmptyAssessments changes
  React.useEffect(() => {
    if (hideEmptyAssessments) {
      // Hide empty assessment columns
      const newVisibility = { ...columnVisibility };
      emptyAssessmentColumns.forEach((colId) => {
        newVisibility[colId] = false;
      });
      void setColumnVisibility(newVisibility);
    } else {
      // Show all columns that were previously hidden due to being empty
      const newVisibility = { ...columnVisibility };
      emptyAssessmentColumns.forEach((colId) => {
        if (newVisibility[colId] === false) {
          newVisibility[colId] = true;
        }
      });
      void setColumnVisibility(newVisibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideEmptyAssessments]);

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
        headerButtons={
          <>
            <button
              type="button"
              class={`btn btn-sm btn-light ${studentsOnlyFilter ? 'active' : ''}`}
              onClick={() => setStudentsOnlyFilter(!studentsOnlyFilter)}
            >
              <i class="fa fa-user-graduate" aria-hidden="true" />{' '}
              {studentsOnlyFilter ? 'Show All' : 'Students Only'}
            </button>
            <button
              type="button"
              class={`btn btn-sm btn-light ${hideEmptyAssessments ? 'active' : ''}`}
              title={
                hideEmptyAssessments
                  ? 'Show all assessment columns'
                  : 'Hide assessment columns with no scores'
              }
              onClick={() => setHideEmptyAssessments(!hideEmptyAssessments)}
            >
              <i class="fa fa-eye-slash" aria-hidden="true" />{' '}
              {hideEmptyAssessments ? 'Show Empty' : 'Hide Empty'}
            </button>
            <button
              type="button"
              class="btn btn-sm btn-light"
              onClick={() => {
                window.location.href = `${urlPrefix}/instance_admin/gradebook/${csvFilename}`;
              }}
            >
              <i class="fa fa-download" aria-hidden="true" /> Download
            </button>
          </>
        }
        globalFilter={{
          value: globalFilter,
          setValue: setGlobalFilter,
          placeholder: 'Search by UID, name...',
        }}
        tableOptions={{
          filters: {
            role: ({ header }) => (
              <CategoricalColumnFilter
                columnId={header.column.id}
                columnLabel="Role"
                allColumnValues={ROLE_VALUES}
                renderValueLabel={({ value }) => <span>{value}</span>}
                columnValuesFilter={roleFilter}
                setColumnValuesFilter={setRoleFilter}
              />
            ),
          },
        }}
        downloadButtonOptions={null}
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
  // eslint-disable-next-line @eslint-react/naming-convention/use-state
  const [queryClient, _setQueryClient] = React.useState(() => new QueryClient());

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
