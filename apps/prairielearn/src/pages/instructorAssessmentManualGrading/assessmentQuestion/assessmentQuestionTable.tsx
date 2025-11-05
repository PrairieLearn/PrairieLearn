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
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import * as React from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/compat';
import { Button, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { z } from 'zod';

import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
  TanstackTableCard,
  numericColumnFilterFn,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { EditQuestionPointsScoreButton } from '../../../components/EditQuestionPointsScore.js';
import { RubricSettings } from '../../../components/RubricSettings.js';
import { ScorebarHtml } from '../../../components/Scorebar.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import {
  NuqsAdapter,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsNumericFilter,
  parseAsSortingState,
} from '../../../lib/client/nuqs.js';
import type {
  PageContextWithAuthzData,
  StaffCourseInstanceContext,
} from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getStudentEnrollmentUrl } from '../../../lib/client/url.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../lib/db-types.js';
import { formatPoints } from '../../../lib/format.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { GRADING_STATUS_VALUES, type GradingStatusValue } from './assessmentQuestion.shared.js';
import {
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
  InstanceQuestionRowWithAIGradingStatsSchema as InstanceQuestionRowSchema,
} from './assessmentQuestion.types.js';

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: [], right: [] };
const DEFAULT_GRADING_STATUS_FILTER: GradingStatusValue[] = [];
const DEFAULT_ASSIGNED_GRADER_FILTER: string[] = [];
const DEFAULT_GRADED_BY_FILTER: string[] = [];
const DEFAULT_SUBMISSION_GROUP_FILTER: string[] = [];
const DEFAULT_RUBRIC_ITEMS_FILTER: string[] = [];

const columnHelper = createColumnHelper<InstanceQuestionRow>();

/** Helper to generate AI grader name. */
function generateAiGraderName(
  ai_grading_status?: 'Graded' | 'OutdatedRubric' | 'LatestRubric',
): string {
  return (
    'AI' +
    (ai_grading_status === undefined ||
    ai_grading_status === 'Graded' ||
    ai_grading_status === 'LatestRubric'
      ? ''
      : ' (outdated)')
  );
}

/** Helper to format points with edit button. */
function formatPointsWithEdit({
  row,
  field,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
}: {
  row: InstanceQuestionRow;
  field: 'manual_points' | 'auto_points' | 'points';
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const points = row[field];
  const maxPoints = row.assessment_question[`max_${field}`];

  return (
    <div class="d-flex align-items-center justify-content-center gap-1">
      <span>
        {formatPoints(points ?? 0)}{' '}
        <small>
          /<span class="text-muted">{maxPoints ?? 0}</span>
        </small>
      </span>
      {hasCourseInstancePermissionEdit && (
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: EditQuestionPointsScoreButton({
              field,
              instance_question: row,
              assessment_question: row.assessment_question,
              urlPrefix,
              csrfToken,
            }).toString(),
          }}
        />
      )}
    </div>
  );
}

/** Helper to format score with edit button. */
function formatScoreWithEdit({
  row,
  hasCourseInstancePermissionEdit,
  urlPrefix,
  csrfToken,
}: {
  row: InstanceQuestionRow;
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const score = row.score_perc;

  return (
    <div class="d-flex align-items-center justify-content-center gap-1">
      {score != null && (
        <div
          class="d-inline-block align-middle"
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: ScorebarHtml(score, { minWidth: '10em' }).toString(),
          }}
        />
      )}
      {hasCourseInstancePermissionEdit && (
        <div
          // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: EditQuestionPointsScoreButton({
              field: 'score_perc',
              instance_question: row,
              assessment_question: row.assessment_question,
              urlPrefix,
              csrfToken,
            }).toString(),
          }}
        />
      )}
    </div>
  );
}

interface AssessmentQuestionTableProps {
  authzData: PageContextWithAuthzData['authz_data'];
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  csrfToken: string;
  instanceQuestions: InstanceQuestionRow[];
  urlPrefix: string;
  assessmentId: string;
  assessmentQuestionId: string;
  assessmentQuestion: AssessmentQuestion;
  assessmentTid: string;
  questionQid: string;
  aiGradingMode: boolean;
  groupWork: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: InstanceQuestionGroup[];
  courseStaff: { user_id: string; name: string | null; uid: string }[];
  aiGradingStats: AiGradingGeneralStats | null;
}

function AssessmentQuestionTable({
  authzData,
  csrfToken,
  instanceQuestions: initialInstanceQuestions,
  urlPrefix,
  assessmentId,
  assessmentQuestionId,
  assessmentQuestion,
  assessmentTid,
  questionQid,
  aiGradingMode,
  groupWork,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  course,
  courseInstance,
  aiGradingStats,
}: AssessmentQuestionTableProps) {
  const [globalFilter, setGlobalFilter] = useQueryState('search', parseAsString.withDefault(''));
  const [sorting, setSorting] = useQueryState<SortingState>(
    'sort',
    parseAsSortingState.withDefault(DEFAULT_SORT),
  );
  const [columnPinning, setColumnPinning] = useQueryState(
    'frozen',
    parseAsColumnPinningState.withDefault(DEFAULT_PINNING),
  );

  const [gradingStatusFilter, setGradingStatusFilter] = useQueryState(
    'status',
    parseAsArrayOf(parseAsStringLiteral(GRADING_STATUS_VALUES)).withDefault(
      DEFAULT_GRADING_STATUS_FILTER,
    ),
  );
  const [assignedGraderFilter, setAssignedGraderFilter] = useQueryState(
    'assigned_grader',
    parseAsArrayOf(parseAsString).withDefault(DEFAULT_ASSIGNED_GRADER_FILTER),
  );
  const [gradedByFilter, setGradedByFilter] = useQueryState(
    'graded_by',
    parseAsArrayOf(parseAsString).withDefault(DEFAULT_GRADED_BY_FILTER),
  );
  const [submissionGroupFilter, setSubmissionGroupFilter] = useQueryState(
    'submission_group',
    parseAsArrayOf(parseAsString).withDefault(DEFAULT_SUBMISSION_GROUP_FILTER),
  );
  const [rubricItemsFilter, setRubricItemsFilter] = useQueryState(
    'rubric_items',
    parseAsArrayOf(parseAsString).withDefault(DEFAULT_RUBRIC_ITEMS_FILTER),
  );

  const [manualPointsFilter, setManualPointsFilter] = useQueryState(
    'manual_points',
    parseAsNumericFilter.withDefault(''),
  );
  const [autoPointsFilter, setAutoPointsFilter] = useQueryState(
    'auto_points',
    parseAsNumericFilter.withDefault(''),
  );
  const [totalPointsFilter, setTotalPointsFilter] = useQueryState(
    'total_points',
    parseAsNumericFilter.withDefault(''),
  );
  const [scoreFilter, setScoreFilter] = useQueryState(
    'score',
    parseAsNumericFilter.withDefault(''),
  );

  const [showStudentInfo, setShowStudentInfo] = useState(false);
  const { createCheckboxProps } = useShiftClickCheckbox<InstanceQuestionRow>();

  const columnFilters = useMemo(() => {
    const filters = [
      { id: 'requires_manual_grading', value: gradingStatusFilter },
      { id: 'assigned_grader_name', value: assignedGraderFilter },
      { id: 'last_grader_name', value: gradedByFilter },
      { id: 'manual_points', value: manualPointsFilter },
      { id: 'points', value: totalPointsFilter },
    ];

    // Only add filters for columns that exist
    if (aiGradingMode && instanceQuestionGroups.length > 0) {
      filters.push({ id: 'instance_question_group_name', value: submissionGroupFilter });
    }
    if (rubricData) {
      filters.push({ id: 'rubric_grading_item_ids', value: rubricItemsFilter });
    }
    if (assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0) {
      filters.push({ id: 'auto_points', value: autoPointsFilter });
    }
    if (!aiGradingMode) {
      filters.push({ id: 'score_perc', value: scoreFilter });
    }

    return filters;
  }, [
    gradingStatusFilter,
    assignedGraderFilter,
    gradedByFilter,
    submissionGroupFilter,
    rubricItemsFilter,
    manualPointsFilter,
    autoPointsFilter,
    totalPointsFilter,
    scoreFilter,
    aiGradingMode,
    instanceQuestionGroups.length,
    rubricData,
    assessmentQuestion.max_auto_points,
  ]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState({});

  const { data: instanceQuestions = initialInstanceQuestions } = useQuery<InstanceQuestionRow[]>({
    queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
    queryFn: async () => {
      const res = await fetch(
        `${urlPrefix}/assessment/${assessmentId}/manual_grading/assessment_question/${assessmentQuestionId}/instances.json`,
      );
      if (!res.ok) throw new Error('Failed to fetch instance questions');
      const data = await res.json();
      if (!data.instance_questions) throw new Error('Invalid response format');
      const parsedData = z.array(InstanceQuestionRowSchema).safeParse(data.instance_questions);
      if (!parsedData.success) throw new Error('Failed to parse instance questions');
      return parsedData.data;
    },
    refetchInterval: 30000, // 30 seconds
    staleTime: 0,
    initialData: initialInstanceQuestions,
  });

  // Get all unique graders from the data
  const allGraders = useMemo(() => {
    const graders = new Set<string>();
    instanceQuestions.forEach((row) => {
      if (row.assigned_grader_name) graders.add(row.assigned_grader_name);
      if (row.last_grader_name) graders.add(row.last_grader_name);
      if (row.ai_grading_status !== 'None') {
        graders.add(generateAiGraderName(row.ai_grading_status));
      }
    });
    return Array.from(graders).toSorted();
  }, [instanceQuestions]);

  // Get all unique submission groups
  const allSubmissionGroups = useMemo(() => {
    const groups = new Set<string>();
    instanceQuestions.forEach((row) => {
      if (row.instance_question_group_name) groups.add(row.instance_question_group_name);
    });
    return Array.from(groups).toSorted();
  }, [instanceQuestions]);

  // Get all rubric items
  const allRubricItems = useMemo(() => {
    return (rubricData?.rubric_items ?? []).map((item) => item.id);
  }, [rubricData]);

  const columns = useMemo(
    () => [
      // Checkbox column for batch selection
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row, table }) => {
          const checkboxProps = createCheckboxProps(row, table);
          return <input type="checkbox" {...checkboxProps} />;
        },
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableHiding: false,
        enablePinning: false,
        enableResizing: false,
      }),

      // Instance number column
      columnHelper.accessor((row, index) => index, {
        id: 'index',
        header: 'Instance',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div>
              <a
                href={`${urlPrefix}/assessment/${assessmentId}/manual_grading/instance_question/${row.id}`}
              >
                Instance {info.getValue() + 1}
              </a>
              {row.open_issue_count ? (
                <OverlayTrigger
                  overlay={
                    <Tooltip>
                      Instance question has {row.open_issue_count} open{' '}
                      {row.open_issue_count > 1 ? 'issues' : 'issue'}
                    </Tooltip>
                  }
                >
                  <span class="badge rounded-pill text-bg-danger ms-2">{row.open_issue_count}</span>
                </OverlayTrigger>
              ) : null}
              {row.assessment_open ? (
                <OverlayTrigger overlay={<Tooltip>Assessment instance is still open</Tooltip>}>
                  <i class="fas fa-exclamation-triangle text-warning ms-2" />
                </OverlayTrigger>
              ) : null}
            </div>
          );
        },
        enableColumnFilter: false,
      }),

      // Submission group column (AI grading mode only)
      ...(aiGradingMode && instanceQuestionGroups.length > 0
        ? [
            columnHelper.accessor('instance_question_group_name', {
              id: 'instance_question_group_name',
              header: 'Submission Group',
              cell: (info) => {
                const value = info.getValue();
                if (!value) {
                  return <span class="text-secondary">No Group</span>;
                }
                const group = instanceQuestionGroups.find(
                  (g) => g.instance_question_group_name === value,
                );
                return (
                  <span class="d-flex align-items-center gap-2">
                    {value}
                    {group && (
                      <OverlayTrigger
                        overlay={<Tooltip>{group.instance_question_group_description}</Tooltip>}
                      >
                        <i class="fas fa-circle-info text-secondary" />
                      </OverlayTrigger>
                    )}
                  </span>
                );
              },
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                const current = row.getValue(columnId);
                if (current === null || current === undefined) {
                  return filterValues.includes('No Group');
                }
                return filterValues.includes(current as string);
              },
            }),
          ]
        : []),

      // User/Group name column (hidden by default)
      columnHelper.accessor('user_or_group_name', {
        id: 'user_or_group_name',
        header: groupWork ? 'Group Name' : 'Name',
        cell: (info) => info.getValue() || '—',
        enableHiding: true,
      }),

      // UID column (hidden by default)
      columnHelper.accessor('uid', {
        id: 'uid',
        header: groupWork ? 'UIDs' : 'UID',
        cell: (info) => {
          const uid = info.getValue();
          const enrollmentId = info.row.original.enrollment_id;
          if (!uid) return '—';
          if (enrollmentId) {
            return <a href={getStudentEnrollmentUrl(urlPrefix, enrollmentId)}>{uid}</a>;
          }
          return uid;
        },
        enableHiding: true,
      }),

      // Grading status column
      columnHelper.accessor('requires_manual_grading', {
        id: 'requires_manual_grading',
        header: 'Grading status',
        cell: (info) => (info.getValue() ? 'Requires grading' : 'Graded'),
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const requiresGrading = row.getValue(columnId);
          const status = requiresGrading ? 'Requires grading' : 'Graded';
          return filterValues.includes(status);
        },
      }),

      // Assigned grader column
      columnHelper.accessor('assigned_grader_name', {
        id: 'assigned_grader_name',
        header: 'Assigned grader',
        cell: (info) => info.getValue() || 'Unassigned',
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const current = row.getValue(columnId);
          if (!current) return filterValues.includes('Unassigned');
          return filterValues.includes(current as string);
        },
      }),

      // Auto points column (only if assessment has auto points)
      ...(assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0
        ? [
            columnHelper.accessor('auto_points', {
              id: 'auto_points',
              header: 'Auto points',
              cell: (info) =>
                formatPointsWithEdit({
                  row: info.row.original,
                  field: 'auto_points',
                  hasCourseInstancePermissionEdit:
                    authzData.has_course_instance_permission_edit ?? false,
                  urlPrefix,
                  csrfToken,
                }),
              filterFn: numericColumnFilterFn,
            }),
          ]
        : []),

      // Manual points column
      columnHelper.accessor('manual_points', {
        id: 'manual_points',
        header: 'Manual points',
        cell: (info) =>
          formatPointsWithEdit({
            row: info.row.original,
            field: 'manual_points',
            hasCourseInstancePermissionEdit: authzData.has_course_instance_permission_edit ?? false,
            urlPrefix,
            csrfToken,
          }),
        filterFn: numericColumnFilterFn,
      }),

      // Total points column (hidden by default)
      columnHelper.accessor('points', {
        id: 'points',
        header: 'Total points',
        cell: (info) =>
          formatPointsWithEdit({
            row: info.row.original,
            field: 'points',
            hasCourseInstancePermissionEdit: authzData.has_course_instance_permission_edit ?? false,
            urlPrefix,
            csrfToken,
          }),
        filterFn: numericColumnFilterFn,
        enableHiding: true,
      }),

      // Score percentage column (not in AI grading mode)
      ...(!aiGradingMode
        ? [
            columnHelper.accessor('score_perc', {
              id: 'score_perc',
              header: 'Percentage score',
              cell: (info) =>
                formatScoreWithEdit({
                  row: info.row.original,
                  hasCourseInstancePermissionEdit:
                    authzData.has_course_instance_permission_edit ?? false,
                  urlPrefix,
                  csrfToken,
                }),
              filterFn: numericColumnFilterFn,
            }),
          ]
        : []),

      // Graded by column
      columnHelper.accessor('last_grader_name', {
        id: 'last_grader_name',
        header: 'Graded by',
        cell: (info) => {
          const row = info.row.original;
          if (aiGradingMode) {
            const showPlus = row.ai_grading_status !== 'None' && row.last_human_grader;
            return (
              <span>
                {row.ai_grading_status !== 'None' && (
                  <span
                    class={`badge rounded-pill text-bg-light border ${
                      row.ai_grading_status === 'Graded' || row.ai_grading_status === 'LatestRubric'
                        ? ''
                        : 'text-muted'
                    }`}
                  >
                    {generateAiGraderName(row.ai_grading_status)}
                  </span>
                )}
                {showPlus && ' + '}
                {row.last_human_grader && <span>{row.last_human_grader}</span>}
              </span>
            );
          } else {
            if (!info.getValue()) return 'Unassigned';
            if (row.is_ai_graded) {
              return (
                <span class="badge rounded-pill text-bg-light border">
                  {generateAiGraderName()}
                </span>
              );
            }
            return info.getValue();
          }
        },
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const current = row.getValue(columnId);
          if (!current) return filterValues.includes('Unassigned');
          const rowData = row.original;

          // Check AI grader
          if (rowData.ai_grading_status !== 'None') {
            const aiGraderName = generateAiGraderName(rowData.ai_grading_status);
            if (filterValues.includes(aiGraderName)) return true;
          }

          // Check human grader
          return filterValues.includes(current as string);
        },
      }),

      // AI agreement column (AI grading mode only)
      ...(aiGradingMode
        ? [
            columnHelper.accessor('rubric_difference', {
              id: 'rubric_difference',
              header: 'AI agreement',
              cell: (info) => {
                const row = info.row.original;
                if (row.point_difference === null) {
                  return '—';
                }

                if (row.rubric_difference === null) {
                  if (!row.point_difference) {
                    return <i class="bi bi-check-square-fill text-success" />;
                  } else {
                    const prefix = row.point_difference < 0 ? '' : '+';
                    return (
                      <span class="text-danger">
                        <i class="bi bi-x-square-fill" /> {prefix}
                        {formatPoints(row.point_difference)}
                      </span>
                    );
                  }
                }

                if (row.rubric_difference.length === 0) {
                  return <i class="bi bi-check-square-fill text-success" />;
                }

                return (
                  <div>
                    {row.rubric_difference.map((item) => (
                      <div key={item.description}>
                        {item.false_positive ? (
                          <OverlayTrigger
                            overlay={<Tooltip>Selected by AI but not by human</Tooltip>}
                          >
                            <i class="bi bi-plus-square-fill text-danger" />
                          </OverlayTrigger>
                        ) : (
                          <OverlayTrigger
                            overlay={<Tooltip>Selected by human but not by AI</Tooltip>}
                          >
                            <i class="bi bi-dash-square-fill text-danger" />
                          </OverlayTrigger>
                        )}{' '}
                        <span>{item.description}</span>
                      </div>
                    ))}
                  </div>
                );
              },
              enableColumnFilter: false,
              sortingFn: (rowA, rowB) => {
                const aDiff = rowA.original.point_difference;
                const bDiff = rowB.original.point_difference;

                if (aDiff === null && bDiff === null) return 0;
                if (aDiff === null) return 1;
                if (bDiff === null) return -1;

                const aRubricDiff = rowA.original.rubric_difference?.length ?? 0;
                const bRubricDiff = rowB.original.rubric_difference?.length ?? 0;

                if (aRubricDiff !== bRubricDiff) {
                  return aRubricDiff - bRubricDiff;
                }

                return Math.abs(aDiff) - Math.abs(bDiff);
              },
            }),
          ]
        : []),

      // Rubric items column (for filtering, not displayed)
      ...(rubricData
        ? [
            columnHelper.accessor('rubric_grading_item_ids', {
              id: 'rubric_grading_item_ids',
              header: 'Rubric Items',
              cell: () => null,
              enableHiding: true,
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                const rowItemIds = row.getValue(columnId) as string[];
                // ALL selected items must be present (AND logic)
                return filterValues.every((itemId) => rowItemIds.includes(itemId));
              },
            }),
          ]
        : []),
    ],
    [
      aiGradingMode,
      instanceQuestionGroups,
      groupWork,
      assessmentQuestion,
      authzData,
      urlPrefix,
      csrfToken,
      assessmentId,
      rubricData,
      createCheckboxProps,
    ],
  );

  const allColumnIds = columns.map((col) => col.id).filter((id) => typeof id === 'string');
  const defaultColumnVisibility = Object.fromEntries(
    allColumnIds.map((id) => [
      id,
      // Hide by default: user_or_group_name, uid, points, rubric_grading_item_ids
      !['user_or_group_name', 'uid', 'points', 'rubric_grading_item_ids'].includes(id),
    ]),
  );

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds).withDefault(defaultColumnVisibility),
  );

  // Update column visibility when AI grading mode changes
  useEffect(() => {
    void setColumnVisibility((prev) => ({
      ...prev,
      // Hide these columns in AI grading mode
      requires_manual_grading: !aiGradingMode,
      assigned_grader_name: !aiGradingMode,
      score_perc: !aiGradingMode,
      // Show these columns in AI grading mode
      instance_question_group_name: aiGradingMode,
      rubric_difference: aiGradingMode,
    }));
  }, [aiGradingMode, setColumnVisibility]);

  const table = useReactTable({
    data: instanceQuestions,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.id,
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
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setColumnPinning,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
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

  // Handle show/hide student info toggle
  const toggleStudentInfo = () => {
    const newVisibility = {
      ...table.getState().columnVisibility,
      user_or_group_name: !showStudentInfo,
      uid: !showStudentInfo,
    };
    void setColumnVisibility(newVisibility);
    setShowStudentInfo(!showStudentInfo);
  };

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = selectedRows.map((row) => row.original.id);

  // Handler for batch actions
  const handleBatchAction = (actionData: Record<string, any>) => {
    if (selectedIds.length === 0) return;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '';

    // Add CSRF token
    const csrfInput = document.createElement('input');
    csrfInput.type = 'hidden';
    csrfInput.name = '__csrf_token';
    csrfInput.value = csrfToken;
    form.append(csrfInput);

    // Add action type
    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = '__action';
    actionInput.value = 'batch_action';
    form.append(actionInput);

    // Add action data
    const dataInput = document.createElement('input');
    dataInput.type = 'hidden';
    dataInput.name = 'batch_action_data';
    dataInput.value = JSON.stringify(actionData);
    form.append(dataInput);

    // Add selected instance question IDs
    selectedIds.forEach((id) => {
      const idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'instance_question_id';
      idInput.value = id;
      form.append(idInput);
    });

    document.body.append(form);
    form.submit();
  };

  return (
    <>
      <div class="mb-3">
        <RubricSettings
          assessmentQuestion={assessmentQuestion}
          rubricData={rubricData}
          csrfToken={csrfToken}
          aiGradingStats={aiGradingStats}
          context={{
            course_short_name: course.short_name,
            course_instance_short_name: courseInstance.short_name,
            assessment_tid: assessmentTid,
            question_qid: questionQid,
          }}
        />
      </div>
      <TanstackTableCard
        table={table}
        title="Student instance questions"
        headerButtons={
          <>
            <Button variant="light" size="sm" onClick={toggleStudentInfo}>
              <i class={showStudentInfo ? 'bi bi-eye-slash' : 'bi bi-eye'} aria-hidden="true" />{' '}
              {showStudentInfo ? 'Hide student info' : 'Show student info'}
            </Button>
            {authzData.has_course_instance_permission_edit && (
              <Dropdown>
                <Dropdown.Toggle variant="light" size="sm" disabled={selectedIds.length === 0}>
                  <i class="fas fa-tags" aria-hidden="true" /> Tag for grading
                </Dropdown.Toggle>
                <Dropdown.Menu align="end">
                  <Dropdown.Header>Assign for grading</Dropdown.Header>
                  {courseStaff.map((grader) => (
                    <Dropdown.Item
                      key={grader.user_id}
                      onClick={() => handleBatchAction({ assigned_grader: grader.user_id })}
                    >
                      <i class="fas fa-user-tag" /> Assign to: {grader.name || ''} ({grader.uid})
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item onClick={() => handleBatchAction({ assigned_grader: null })}>
                    <i class="fas fa-user-slash" /> Remove grader assignment
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    onClick={() => handleBatchAction({ requires_manual_grading: true })}
                  >
                    <i class="fas fa-tag" /> Tag as required grading
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => handleBatchAction({ requires_manual_grading: false })}
                  >
                    <i class="fas fa-check-square" /> Tag as graded
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )}
          </>
        }
        globalFilter={{
          value: globalFilter,
          setValue: setGlobalFilter,
          placeholder: 'Search by name, UID...',
        }}
        tableOptions={{
          rowHeight: 48,
          filters: {
            requires_manual_grading: ({ header }) => (
              <CategoricalColumnFilter
                columnId={header.column.id}
                columnLabel="Status"
                allColumnValues={GRADING_STATUS_VALUES}
                renderValueLabel={({ value }) => <span>{value}</span>}
                columnValuesFilter={gradingStatusFilter}
                setColumnValuesFilter={setGradingStatusFilter}
              />
            ),
            assigned_grader_name: ({ header }) => (
              <CategoricalColumnFilter
                columnId={header.column.id}
                columnLabel="Assigned Grader"
                allColumnValues={[...allGraders, 'Unassigned']}
                renderValueLabel={({ value }) => <span>{value}</span>}
                columnValuesFilter={assignedGraderFilter}
                setColumnValuesFilter={setAssignedGraderFilter}
              />
            ),
            last_grader_name: ({ header }) => (
              <CategoricalColumnFilter
                columnId={header.column.id}
                columnLabel="Graded By"
                allColumnValues={[...allGraders, 'Unassigned']}
                renderValueLabel={({ value }) => <span>{value}</span>}
                columnValuesFilter={gradedByFilter}
                setColumnValuesFilter={setGradedByFilter}
              />
            ),
            ...(aiGradingMode && instanceQuestionGroups.length > 0
              ? {
                  instance_question_group_name: ({
                    header,
                  }: {
                    header: Header<InstanceQuestionRow, unknown>;
                  }) => (
                    <CategoricalColumnFilter
                      columnId={header.column.id}
                      columnLabel="Submission Group"
                      allColumnValues={[...allSubmissionGroups, 'No Group']}
                      renderValueLabel={({ value }) => <span>{value}</span>}
                      columnValuesFilter={submissionGroupFilter}
                      setColumnValuesFilter={setSubmissionGroupFilter}
                    />
                  ),
                }
              : {}),
            manual_points: ({ header }) => (
              <NumericInputColumnFilter
                columnId={header.column.id}
                columnLabel="Manual Points"
                value={manualPointsFilter}
                onChange={setManualPointsFilter}
              />
            ),
            ...(assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0
              ? {
                  auto_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
                    <NumericInputColumnFilter
                      columnId={header.column.id}
                      columnLabel="Auto Points"
                      value={autoPointsFilter}
                      onChange={setAutoPointsFilter}
                    />
                  ),
                }
              : {}),
            points: ({ header }) => (
              <NumericInputColumnFilter
                columnId={header.column.id}
                columnLabel="Total Points"
                value={totalPointsFilter}
                onChange={setTotalPointsFilter}
              />
            ),
            ...(!aiGradingMode
              ? {
                  score_perc: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
                    <NumericInputColumnFilter
                      columnId={header.column.id}
                      columnLabel="Score"
                      value={scoreFilter}
                      onChange={setScoreFilter}
                    />
                  ),
                }
              : {}),
            ...(rubricData
              ? {
                  rubric_grading_item_ids: ({
                    header,
                  }: {
                    header: Header<InstanceQuestionRow, unknown>;
                  }) => (
                    <MultiSelectColumnFilter
                      columnId={header.column.id}
                      columnLabel="Rubric Items"
                      allColumnValues={allRubricItems}
                      renderValueLabel={({ value }) => {
                        const item = rubricData.rubric_items.find((i) => i.id === value);
                        return <span>{item?.description || value}</span>;
                      }}
                      columnValuesFilter={rubricItemsFilter}
                      setColumnValuesFilter={setRubricItemsFilter}
                    />
                  ),
                }
              : {}),
          },
        }}
        downloadButtonOptions={{
          filenameBase: `manual_grading_${questionQid}`,
          pluralLabel: 'submissions',
          mapRowToData: (row) => ({
            Instance: row.id,
            [groupWork ? 'Group Name' : 'Name']: row.user_or_group_name || '',
            [groupWork ? 'UIDs' : 'UID']: row.uid || '',
            'Grading Status': row.requires_manual_grading ? 'Requires grading' : 'Graded',
            'Assigned Grader': row.assigned_grader_name || '',
            'Auto Points': row.auto_points != null ? row.auto_points.toString() : '',
            'Manual Points': row.manual_points != null ? row.manual_points.toString() : '',
            'Total Points': row.points != null ? row.points.toString() : '',
            'Score %': row.score_perc != null ? row.score_perc.toString() : '',
            'Graded By': row.last_grader_name || '',
            'Modified At': row.modified_at.toISOString(),
          }),
        }}
      />
    </>
  );
}

function AssessmentQuestionManualGrading({
  authzData,
  search,
  instanceQuestions,
  course,
  courseInstance,
  urlPrefix,
  csrfToken,
  assessmentId,
  assessmentQuestionId,
  assessmentQuestion,
  assessmentTid,
  questionQid,
  aiGradingMode,
  groupWork,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats,
  isDevMode,
}: {
  authzData: PageContextWithAuthzData['authz_data'];
  search: string;
  isDevMode: boolean;
} & AssessmentQuestionTableProps) {
  // eslint-disable-next-line @eslint-react/naming-convention/use-state
  const [queryClient, _setQueryClient] = React.useState(() => new QueryClient());

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <AssessmentQuestionTable
          authzData={authzData}
          course={course}
          courseInstance={courseInstance}
          csrfToken={csrfToken}
          instanceQuestions={instanceQuestions}
          urlPrefix={urlPrefix}
          assessmentId={assessmentId}
          assessmentQuestionId={assessmentQuestionId}
          assessmentQuestion={assessmentQuestion}
          assessmentTid={assessmentTid}
          questionQid={questionQid}
          aiGradingMode={aiGradingMode}
          groupWork={groupWork}
          rubricData={rubricData}
          instanceQuestionGroups={instanceQuestionGroups}
          courseStaff={courseStaff}
          aiGradingStats={aiGradingStats}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';

export default AssessmentQuestionManualGrading;
