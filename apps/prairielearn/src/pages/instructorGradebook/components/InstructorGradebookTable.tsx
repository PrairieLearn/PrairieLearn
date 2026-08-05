import { QueryClient, useQuery } from '@tanstack/react-query';
import {
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
import { parseAsString, useQueryState } from 'nuqs';
import { useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  type ColumnFilterEntry,
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  type NumericColumnFilterValue,
  NumericInputColumnFilter,
  NuqsAdapter,
  PresetFilterDropdown,
  TanstackTableCard,
  type TanstackTableCsvCell,
  applyMultiSelectFilter,
  extractLeafColumnIds,
  numericColumnFilterFn,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsNumericFilter,
  parseAsSortingState,
  useColumnFilters,
} from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import { StudentLabelBadge } from '../../../components/StudentLabelBadge.js';
import type { StaffStudentLabel } from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import { type EnumEnrollmentStatus, EnumEnrollmentStatusSchema } from '../../../lib/db-types.js';
import {
  type CourseAssessmentRow,
  type GradebookRow,
  GradebookRowSchema,
} from '../instructorGradebook.types.js';

import { CanvasCsvModal } from './CanvasCsvModal.js';
import { EditScoreButton } from './EditScoreModal.js';

const DEFAULT_SORT: SortingState = [{ id: 'uid', desc: false }];
const DEFAULT_PINNING: ColumnPinningState = { left: ['uid'], right: [] };

const ROLE_VALUES = ['Staff', 'Student', 'None'] as const;
type RoleValue = (typeof ROLE_VALUES)[number];
const STATUS_VALUES = [...EnumEnrollmentStatusSchema.options];
const EMPTY_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const EMPTY_ROLE_FILTER: MultiSelectFilterValue<RoleValue> = { values: [], mode: 'include' };
const EMPTY_STATUS_FILTER: MultiSelectFilterValue<EnumEnrollmentStatus> = {
  values: [],
  mode: 'include',
};
const DEFAULT_ROLE_FILTER: MultiSelectFilterValue<RoleValue> = {
  values: ['Student'],
  mode: 'include',
};
const DEFAULT_STATUS_FILTER: MultiSelectFilterValue<EnumEnrollmentStatus> = {
  values: ['joined'],
  mode: 'include',
};
const EMPTY_NUMERIC_FILTER: NumericColumnFilterValue = { filterValue: '', emptyOnly: false };

const columnHelper = createColumnHelper<GradebookRow>();

interface GradebookTableProps {
  csrfToken: string;
  courseAssessments: CourseAssessmentRow[];
  gradebookRows: GradebookRow[];
  studentLabels: StaffStudentLabel[];
  urlPrefix: string;
  courseInstanceId: string;
  filenameBase: string;
}

function GradebookTable({
  csrfToken,
  courseAssessments,
  gradebookRows: initialGradebookRows,
  studentLabels,
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
  const assessmentIds = useMemo(() => {
    return courseAssessments.map((assessment) => assessment.assessment_id);
  }, [courseAssessments]);

  const filterRegistry = useMemo(() => {
    const registry: Record<
      string,
      ColumnFilterEntry<MultiSelectFilterValue<any>> | ColumnFilterEntry<NumericColumnFilterValue>
    > = {
      role: {
        parser: parseAsMultiSelectFilter(ROLE_VALUES),
        defaultValue: DEFAULT_ROLE_FILTER,
      },
      enrollment_status: {
        urlKey: 'status',
        parser: parseAsMultiSelectFilter(STATUS_VALUES),
        defaultValue: DEFAULT_STATUS_FILTER,
      },
      student_labels: {
        parser: parseAsMultiSelectFilter(),
        defaultValue: EMPTY_FILTER,
      },
    };
    for (const id of assessmentIds) {
      registry[`a${id}`] = {
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
      };
    }
    return registry;
  }, [assessmentIds]);

  const { columnFilters, activeColumnFilterIds, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

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

  const studentLabelsById = useMemo(
    () => new Map(studentLabels.map((l) => [l.id, l])),
    [studentLabels],
  );

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
        filterFn: (row, columnId, filter: MultiSelectFilterValue<RoleValue>) => {
          const current = row.getValue<GradebookRow['role']>(columnId);
          return applyMultiSelectFilter(filter, (values) => values.includes(current));
        },
      }),

      columnHelper.accessor((row) => row.enrollment?.status, {
        id: 'enrollment_status',
        header: 'Enrollment',
        cell: (info) => {
          const status = info.getValue();
          return status ? <EnrollmentStatusIcon type="text" status={status} /> : '—';
        },
        filterFn: (row, columnId, filter: MultiSelectFilterValue<EnumEnrollmentStatus>) => {
          const current = row.getValue<EnumEnrollmentStatus | undefined>(columnId);
          // Rows without an enrollment status can't satisfy any include filter,
          // and shouldn't be hidden by an exclude filter that doesn't reference them.
          if (!current) return filter.values.length === 0 || filter.mode === 'exclude';
          return applyMultiSelectFilter(filter, (values) => values.includes(current));
        },
      }),

      columnHelper.accessor('student_label_ids', {
        id: 'student_labels',
        meta: {
          label: 'Labels',
        },
        header: () => (
          <span className="d-inline-flex align-items-center gap-1">
            <span>Labels</span>
            <i className="bi bi-people" aria-hidden="true" />
          </span>
        ),
        cell: (info) => {
          const labelIds = info.getValue();
          if (labelIds.length === 0) return '—';
          const labels = labelIds
            .map((id) => studentLabelsById.get(id))
            .filter((l): l is StaffStudentLabel => l != null);
          return (
            <div className="d-flex flex-wrap gap-1">
              {labels.map((label) => (
                <StudentLabelBadge key={label.id} label={label} />
              ))}
            </div>
          );
        },
        filterFn: (row, columnId, filter: MultiSelectFilterValue) => {
          const labelIds = new Set(row.getValue<GradebookRow['student_label_ids']>(columnId));
          return applyMultiSelectFilter(filter, (values) => values.some((id) => labelIds.has(id)));
        },
      }),

      ...Array.from(assessmentsBySet.groups.entries()).map(([setId, assessments]) =>
        columnHelper.group({
          id: `group_${setId}`,
          header: assessmentsBySet.headingById.get(setId) ?? 'Unknown',
          columns: assessments.map((assessment) =>
            columnHelper.accessor(
              (row) => {
                const data = row.scores[assessment.assessment_id];
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
    [
      assessmentsBySet.groups,
      assessmentsBySet.headingById,
      urlPrefix,
      courseInstanceId,
      csrfToken,
      studentLabelsById,
    ],
  );

  const allColumnIds = extractLeafColumnIds(columns);

  const defaultColumnVisibility = useMemo(() => {
    const hiddenByDefault = new Set(['uin', 'role', 'enrollment_status']);
    if (studentLabels.length === 0) {
      hiddenByDefault.add('student_labels');
    }
    return Object.fromEntries(allColumnIds.map((id) => [id, !hiddenByDefault.has(id)]));
  }, [allColumnIds, studentLabels.length]);

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

    const labelIds = studentLabels.map((l) => l.id);

    return {
      role: ({ header }: { header: Header<GradebookRow, GradebookRow['role']> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={ROLE_VALUES}
          renderValueLabel={({ value }) => <span>{value}</span>}
        />
      ),
      enrollment_status: ({ header }: { header: Header<GradebookRow, EnumEnrollmentStatus> }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={STATUS_VALUES}
          renderValueLabel={({ value }) => <EnrollmentStatusIcon type="text" status={value} />}
        />
      ),
      student_labels: ({
        header,
      }: {
        header: Header<GradebookRow, GradebookRow['student_label_ids']>;
      }) => (
        <MultiSelectColumnFilter
          column={header.column}
          allColumnValues={labelIds}
          renderValueLabel={({ value }) => {
            const label = studentLabelsById.get(value);
            if (!label) return <span>{value}</span>;
            return <span>{label.name}</span>;
          }}
        />
      ),
      ...assessmentFilters,
    };
  }, [courseAssessments, studentLabels, studentLabelsById]);

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
    onColumnFiltersChange,
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

  const allRows = table.getCoreRowModel().rows.map((row) => row.original);
  const filteredRows = table.getRowModel().rows.map((row) => row.original);

  const [canvasCsvTarget, setCanvasCsvTarget] = useState<'all' | 'filtered' | null>(null);

  const canvasCsvMenuItems = [
    <hr key="divider" className="dropdown-divider" />,
    <button
      key="all"
      className="dropdown-item"
      type="button"
      role="menuitem"
      disabled={allRows.length === 0}
      onClick={() => setCanvasCsvTarget('all')}
    >
      All users' grades ({allRows.length}) as Canvas CSV
    </button>,
    <button
      key="filtered"
      className="dropdown-item"
      type="button"
      role="menuitem"
      disabled={filteredRows.length === 0}
      onClick={() => setCanvasCsvTarget('filtered')}
    >
      Filtered users' grades ({filteredRows.length}) as Canvas CSV
    </button>,
  ];

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
              {
                name: 'Labels',
                value: row.student_label_ids
                  .map((id) => studentLabelsById.get(id)?.name)
                  .filter((name): name is string => name != null),
              },
            ];
            for (const assessment of courseAssessments) {
              data.push({
                name: assessment.label,
                value: row.scores[assessment.assessment_id]?.score_perc ?? null,
              });
            }
            return data;
          },
          mapRowToJsonData: (row: GradebookRow) => ({
            uid: row.uid,
            name: row.user_name,
            uin: row.uin,
            role: row.role,
            enrollment_status: row.enrollment?.status ?? null,
            labels: row.student_label_ids
              .map((id) => studentLabelsById.get(id)?.name)
              .filter((name): name is string => name != null),
            assessments: courseAssessments.map((assessment) => ({
              assessment_id: assessment.assessment_id,
              short_name: assessment.tid,
              label: assessment.label,
              assessment_set_heading: assessment.assessment_set_heading,

              score_perc: row.scores[assessment.assessment_id]?.score_perc ?? null,
            })),
          }),
          pluralLabel: "users' grades",
          singularLabel: "user's grades",
          hasSelection: false,
          additionalMenuItems: canvasCsvMenuItems,
        }}
        columnManager={{
          buttons: (
            <PresetFilterDropdown
              table={table}
              label="Filter"
              options={{
                'Joined students': [
                  { id: 'enrollment_status', value: DEFAULT_STATUS_FILTER },
                  { id: 'role', value: DEFAULT_ROLE_FILTER },
                ],
                'All students': [
                  { id: 'enrollment_status', value: EMPTY_STATUS_FILTER },
                  { id: 'role', value: DEFAULT_ROLE_FILTER },
                ],
                'All students & staff': [
                  { id: 'enrollment_status', value: EMPTY_STATUS_FILTER },
                  { id: 'role', value: EMPTY_ROLE_FILTER },
                ],
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
        activeColumnFilterIds={activeColumnFilterIds}
        onResetColumnFilters={onResetColumnFilters}
      />
      <CanvasCsvModal
        show={canvasCsvTarget != null}
        courseAssessments={courseAssessments}
        studentRows={(canvasCsvTarget === 'filtered' ? filteredRows : allRows).filter(
          (row) => row.role === 'Student' && row.user_name != null,
        )}
        filename={`${filenameBase}_canvas${canvasCsvTarget === 'filtered' ? '_filtered' : ''}.csv`}
        onHide={() => setCanvasCsvTarget(null)}
      />
    </>
  );
}

export function InstructorGradebookTable({
  csrfToken,
  courseAssessments,
  gradebookRows,
  studentLabels,
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
          studentLabels={studentLabels}
          urlPrefix={urlPrefix}
          filenameBase={filenameBase}
          courseInstanceId={courseInstanceId}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorGradebookTable.displayName = 'InstructorGradebookTable';
