import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnPinningState,
  type ColumnSizingState,
  type Header,
  type SortingState,
  type VisibilityState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { Alert, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
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
import { Scorebar } from '../../../components/Scorebar.js';
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
import { RubricItemsFilter } from './components/RubricItemsFilter.js';

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: [], right: [] };
const DEFAULT_GRADING_STATUS_FILTER: GradingStatusValue[] = [];
const DEFAULT_ASSIGNED_GRADER_FILTER: string[] = [];
const DEFAULT_GRADED_BY_FILTER: string[] = [];
const DEFAULT_SUBMISSION_GROUP_FILTER: string[] = [];
const DEFAULT_AI_AGREEMENT_FILTER: string[] = [];

const columnHelper = createColumnHelper<InstanceQuestionRow>();
const queryClient = new QueryClient();

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
        <div class="d-inline-block align-middle">
          <Scorebar score={score} minWidth="10em" />
        </div>
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

// Types for batch actions
type BatchActionData =
  | { assigned_grader: string | null }
  | { requires_manual_grading: boolean }
  | { batch_action: 'ai_grade_assessment_selected'; closed_instance_questions_only?: boolean }
  | {
      batch_action: 'ai_instance_question_group_selected';
      closed_instance_questions_only?: boolean;
    };

type BatchActionParams =
  | {
      action: 'batch_action';
      actionData: BatchActionData;
      instanceQuestionIds: string[];
    }
  | {
      action:
        | 'ai_grade_assessment_graded'
        | 'ai_grade_assessment_all'
        | 'ai_instance_question_group_assessment_all'
        | 'ai_instance_question_group_assessment_ungrouped';
    };

export interface AssessmentQuestionManualGradingProps {
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
  onShowGroupSelectedModal?: (ids: string[]) => void;
  onShowGroupAllModal?: () => void;
  onShowGroupUngroupedModal?: () => void;
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
  onShowGroupSelectedModal,
  onShowGroupAllModal,
  onShowGroupUngroupedModal,
}: AssessmentQuestionManualGradingProps) {
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
  const [aiAgreementFilter, setAiAgreementFilter] = useQueryState(
    'ai_agreement',
    parseAsArrayOf(parseAsString).withDefault(DEFAULT_AI_AGREEMENT_FILTER),
  );
  const [rubricItemsFilter, setRubricItemsFilter] = useQueryState(
    'rubric_items',
    parseAsArrayOf(parseAsString).withDefault([]),
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
    if (aiGradingMode) {
      filters.push({ id: 'rubric_difference', value: aiAgreementFilter });
    }
    // Filter by rubric items if any are selected
    if (rubricData && rubricData.rubric_items.length > 0 && rubricItemsFilter.length > 0) {
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
    aiAgreementFilter,
    rubricItemsFilter,
    manualPointsFilter,
    autoPointsFilter,
    totalPointsFilter,
    scoreFilter,
    aiGradingMode,
    instanceQuestionGroups.length,
    assessmentQuestion.max_auto_points,
    rubricData,
  ]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryClient = useQueryClient();

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
    refetchInterval: 30000,
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

  // Get all unique AI agreement items (rubric differences)
  const allAiAgreementItems = useMemo(() => {
    const itemsMap = new Map<string, { number: number; description: string }>();
    instanceQuestions.forEach((row) => {
      if (row.rubric_difference && Array.isArray(row.rubric_difference)) {
        row.rubric_difference.forEach((item) => {
          if (!itemsMap.has(item.description)) {
            itemsMap.set(item.description, { number: item.number, description: item.description });
          }
        });
      }
    });
    // Sort by number
    return Array.from(itemsMap.values()).sort((a, b) => a.number - b.number);
  }, [instanceQuestions]);

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
          return <input type="checkbox" {...createCheckboxProps(row, table)} />;
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
                        <span>
                          <i class="fas fa-circle-info text-secondary" />
                        </span>
                      </OverlayTrigger>
                    )}
                  </span>
                );
              },
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                const current =
                  row.getValue<InstanceQuestionRow['instance_question_group_name']>(columnId);
                if (!current) {
                  return filterValues.includes('No Group');
                }
                return filterValues.includes(current);
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
        filterFn: ({ getValue }, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const requiresGrading = getValue(columnId);
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
          const current = row.getValue<InstanceQuestionRow['assigned_grader_name']>(columnId);
          if (!current) return filterValues.includes('Unassigned');
          return filterValues.includes(current);
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
          const current = row.getValue<InstanceQuestionRow['last_grader_name']>(columnId);
          if (!current) return filterValues.includes('Unassigned');
          const rowData = row.original;

          // Check AI grader
          if (rowData.ai_grading_status !== 'None') {
            const aiGraderName = generateAiGraderName(rowData.ai_grading_status);
            if (filterValues.includes(aiGraderName)) return true;
          }

          // Check human grader
          return filterValues.includes(current);
        },
      }),

      // AI agreement column (AI grading mode only)
      ...(aiGradingMode
        ? [
            columnHelper.accessor('rubric_difference', {
              id: 'rubric_difference',
              header: 'AI agreement',
              size: 300,
              minSize: 200,
              maxSize: 600,
              meta: {
                wrapText: true,
              },
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
              filterFn: (row, columnId, filterValues: string[]) => {
                if (filterValues.length === 0) return true;
                const rubricDiff = row.original.rubric_difference;
                if (!rubricDiff || !Array.isArray(rubricDiff)) return false;
                // Check if ALL of the selected items are in the disagreement
                return filterValues.every((description) =>
                  rubricDiff.some((item) => item.description === description),
                );
              },
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

      // Hidden column for filtering by rubric items
      columnHelper.accessor('rubric_grading_item_ids', {
        id: 'rubric_grading_item_ids',
        header: 'Rubric Items',
        enableHiding: false,
        enableSorting: false,
        cell: () => null,
        filterFn: (row, columnId, filterValues: string[]) => {
          if (filterValues.length === 0) return true;
          const rubricItemIds = row.original.rubric_grading_item_ids;
          // Check if ALL of the selected rubric item IDs are in the row's rubric_grading_item_ids
          return filterValues.every((itemId) => rubricItemIds.includes(itemId));
        },
      }),
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

  // Ref for the checkbox element to set indeterminate state
  const studentInfoCheckboxRef = useRef<HTMLInputElement>(null);

  // Determine student info checkbox state based on column visibility
  const studentInfoCheckboxState = useMemo(() => {
    const visibility = columnVisibility;
    const nameVisible = visibility.user_or_group_name;
    const uidVisible = visibility.uid;

    if (nameVisible && uidVisible) return 'checked';
    if (nameVisible || uidVisible) return 'indeterminate';
    return 'unchecked';
  }, [columnVisibility]);

  // Set indeterminate state on the checkbox element
  useEffect(() => {
    if (studentInfoCheckboxRef.current) {
      studentInfoCheckboxRef.current.indeterminate = studentInfoCheckboxState === 'indeterminate';
    }
  }, [studentInfoCheckboxState]);

  // Handle student info checkbox click - toggles between checked (both visible) and unchecked (both hidden)
  const handleStudentInfoCheckboxClick = () => {
    const currentState = studentInfoCheckboxState;
    const currentVisibility = table.getState().columnVisibility;

    let newVisibility: VisibilityState;
    if (currentState === 'checked') {
      // Checked -> Unchecked (hide both)
      newVisibility = {
        ...currentVisibility,
        user_or_group_name: false,
        uid: false,
      };
    } else {
      // Unchecked or Indeterminate -> Checked (show both)
      newVisibility = {
        ...currentVisibility,
        user_or_group_name: true,
        uid: true,
      };
    }

    void setColumnVisibility(newVisibility);
  };

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = selectedRows.map((row) => row.original.id);

  // Set up handlers for edit points popovers
  // FIXME: Clean up this useEffect once other pages handling point changes are also in React.
  useEffect(() => {
    /**
     * Handle AJAX form submission for editing points
     */
    async function handlePointsFormSubmit(this: HTMLFormElement, event: Event) {
      event.preventDefault();
      const formData = new FormData(this);
      // @ts-expect-error - It doesn't like converting FormData to an object
      const postBody = new URLSearchParams(Object.fromEntries(formData.entries()));

      try {
        const response = await fetch(this.action || '', { method: 'POST', body: postBody });
        if (response.status !== 200) {
          console.error(response.status, response.statusText);
          return;
        }

        const data = await response.json();

        // Check for grading conflict
        if (data?.conflict_grading_job_id) {
          const modal = document.getElementById('grading-conflict-modal');
          if (modal) {
            const link = modal.querySelector<HTMLAnchorElement>('.conflict-details-link');
            if (link && data.conflict_details_url) {
              link.href = data.conflict_details_url;
            }
            // Show the modal using Bootstrap's Modal API
            const bsModal = new window.bootstrap.Modal(modal);
            bsModal.show();
          }
        }

        // Dismiss the popover before refetching data
        // Find the button that triggered this form's popover
        const popoverTriggers = document.querySelectorAll('[data-bs-toggle="popover"]');
        popoverTriggers.forEach((trigger) => {
          const popoverInstance = window.bootstrap.Popover.getInstance(trigger);
          if (popoverInstance) {
            popoverInstance.hide();
          }
        });

        // Invalidate and refetch the query to update the table
        await queryClient.invalidateQueries({
          queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
        });
      } catch (err) {
        console.error('Error submitting form:', err);
      }
    }

    /**
     * Set up event listeners when popover is shown
     */
    function handlePopoverShown(this: Element) {
      // Focus the first non-hidden input
      const form = document.querySelector<HTMLFormElement>('form[name=edit-points-form]');
      if (!form) {
        return;
      }
      const input = form.querySelector<HTMLInputElement>('input:not([type="hidden"])');
      if (input) {
        input.focus();
      }

      // Remove any existing event listeners to prevent duplicates
      form.removeEventListener('submit', handlePointsFormSubmit);
      form.addEventListener('submit', handlePointsFormSubmit);
    }

    // Attach event listeners to all popover trigger buttons
    const popoverButtons = document.querySelectorAll('[data-bs-toggle="popover"]');
    popoverButtons.forEach((button) => {
      button.addEventListener('shown.bs.popover', handlePopoverShown);
    });

    // Cleanup function
    return () => {
      const form = document.querySelector<HTMLFormElement>('form[name=edit-points-form]');
      form?.removeEventListener('submit', handlePointsFormSubmit);

      popoverButtons.forEach((button) => {
        button.removeEventListener('shown.bs.popover', handlePopoverShown);
      });
    };
  }, [queryClient, urlPrefix, assessmentId, assessmentQuestionId, instanceQuestions]);

  // Mutation for batch actions
  const batchActionMutation = useMutation({
    mutationFn: async (params: BatchActionParams) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: params.action,
      };

      // Add action-specific data
      if (params.action === 'batch_action') {
        const { actionData, instanceQuestionIds } = params;

        if ('batch_action' in actionData) {
          // For AI grading/grouping actions
          requestBody.batch_action = actionData.batch_action;
          if (actionData.closed_instance_questions_only !== undefined) {
            requestBody.closed_instance_questions_only = actionData.closed_instance_questions_only;
          }
        } else {
          // For regular batch actions
          requestBody.batch_action_data = actionData;
        }

        // Add instance question IDs
        requestBody.instance_question_id = instanceQuestionIds;
      }

      const response = await fetch('', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        redirect: 'manual', // Don't automatically follow redirects
      });

      console.log('response', response);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed: ${response.status} ${response.statusText}`);
      }

      // Check if this is a redirect response
      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get('Location');
        if (redirectUrl) {
          return { redirect: redirectUrl };
        }
      }

      return { success: true };
    },
    onSuccess: (data) => {
      setErrorMessage(null); // Clear any previous errors
      if (data.redirect) {
        // Redirect to job sequence page for long-running operations
        window.location.href = data.redirect;
      } else {
        // Refresh the table data for quick operations
        void queryClient.invalidateQueries({
          queryKey: ['instance-questions', urlPrefix, assessmentId, assessmentQuestionId],
        });
      }
    },
    onError: (error) => {
      console.error('Batch action failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An unknown error occurred');
    },
  });

  // Handler for batch actions
  const handleBatchAction = (actionData: BatchActionData) => {
    if (selectedIds.length === 0) return;

    batchActionMutation.mutate({
      action: 'batch_action',
      actionData,
      instanceQuestionIds: selectedIds,
    });
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
      {errorMessage && (
        <Alert variant="danger" class="mb-3" dismissible onClose={() => setErrorMessage(null)}>
          <strong>Error:</strong> {errorMessage}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Student instance questions"
        columnManagerTopContent={
          <div class="px-2 py-1">
            <label class="d-flex align-items-center gap-2 cursor-pointer user-select-none px-2 py-1">
              <input
                ref={studentInfoCheckboxRef}
                type="checkbox"
                checked={studentInfoCheckboxState === 'checked'}
                class="form-check-input m-0"
                onChange={handleStudentInfoCheckboxClick}
              />
              <span class="text-nowrap">Show student info</span>
            </label>
          </div>
        }
        columnManagerButtons={
          <RubricItemsFilter
            rubricData={rubricData}
            instanceQuestions={instanceQuestions}
            rubricItemsFilter={rubricItemsFilter}
            setRubricItemsFilter={setRubricItemsFilter}
          />
        }
        headerButtons={
          <>
            {aiGradingMode ? (
              <>
                <Dropdown>
                  <Dropdown.Toggle variant="light" size="sm">
                    <i class="bi bi-stars" aria-hidden="true" /> AI grading
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <Dropdown.Item
                      onClick={() =>
                        batchActionMutation.mutate({
                          action: 'ai_grade_assessment_graded',
                        })
                      }
                    >
                      Grade all human-graded
                    </Dropdown.Item>
                    <Dropdown.Item
                      disabled={selectedIds.length === 0}
                      onClick={() =>
                        handleBatchAction({ batch_action: 'ai_grade_assessment_selected' })
                      }
                    >
                      Grade selected
                    </Dropdown.Item>
                    <Dropdown.Item
                      onClick={() =>
                        batchActionMutation.mutate({
                          action: 'ai_grade_assessment_all',
                        })
                      }
                    >
                      Grade all
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      onClick={() => {
                        const modal = document.getElementById('delete-all-ai-grading-jobs-modal');
                        if (modal) {
                          const bsModal = new window.bootstrap.Modal(modal);
                          bsModal.show();
                        }
                      }}
                    >
                      Delete all AI grading results
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
                <Dropdown>
                  <Dropdown.Toggle variant="light" size="sm">
                    <i class="bi bi-stars" aria-hidden="true" /> AI submission grouping
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <Dropdown.Item
                      disabled={selectedIds.length === 0}
                      onClick={() => onShowGroupSelectedModal?.(selectedIds)}
                    >
                      Group selected submissions
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => onShowGroupAllModal?.()}>
                      Group all submissions
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => onShowGroupUngroupedModal?.()}>
                      Group ungrouped submissions
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      onClick={() => {
                        const modal = document.getElementById(
                          'delete-all-ai-instance-question-grouping-results-modal',
                        );
                        if (modal) {
                          const bsModal = new window.bootstrap.Modal(modal);
                          bsModal.show();
                        }
                      }}
                    >
                      Delete all AI groupings
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </>
            ) : (
              authzData.has_course_instance_permission_edit && (
                <Dropdown>
                  <Dropdown.Toggle variant="light" size="sm" disabled={selectedIds.length === 0}>
                    <i class="fas fa-tags" aria-hidden="true" />{' '}
                    <span class="d-none d-sm-inline">Tag for grading</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <Dropdown.Header class="d-flex align-items-center gap-1">
                      Assign for grading
                      <OverlayTrigger
                        overlay={
                          <Tooltip>
                            Only staff with <strong>Student Data Editor</strong> permissions or
                            higher can be assigned as graders
                          </Tooltip>
                        }
                      >
                        <span>
                          <i class="fas fa-question-circle text-secondary" />
                        </span>
                      </OverlayTrigger>
                    </Dropdown.Header>
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
              )
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
            ...(aiGradingMode
              ? {
                  rubric_difference: ({
                    header,
                  }: {
                    header: Header<InstanceQuestionRow, unknown>;
                  }) => (
                    <MultiSelectColumnFilter
                      columnId={header.column.id}
                      columnLabel="AI Disagreements"
                      allColumnValues={allAiAgreementItems.map((item) => item.description)}
                      renderValueLabel={({ value }) => {
                        return <span>{value}</span>;
                      }}
                      columnValuesFilter={aiAgreementFilter}
                      setColumnValuesFilter={setAiAgreementFilter}
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

export type AssessmentQuestionManualGradingWrapperProps = {
  authzData: PageContextWithAuthzData['authz_data'];
  search: string;
  isDevMode: boolean;
  numOpenInstances: number;
} & Omit<AssessmentQuestionManualGradingProps, 'numOpenInstances'>;

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
  numOpenInstances: _numOpenInstances,
  isDevMode,
  onShowGroupSelectedModal,
  onShowGroupAllModal,
  onShowGroupUngroupedModal,
}: AssessmentQuestionManualGradingWrapperProps) {
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
          onShowGroupSelectedModal={onShowGroupSelectedModal}
          onShowGroupAllModal={onShowGroupAllModal}
          onShowGroupUngroupedModal={onShowGroupUngroupedModal}
        />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';

export default AssessmentQuestionManualGrading;
