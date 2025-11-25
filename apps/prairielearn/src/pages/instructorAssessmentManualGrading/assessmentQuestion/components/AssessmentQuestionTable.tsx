import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnPinningState,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { Alert, Button, Dropdown, Modal } from 'react-bootstrap';
import { z } from 'zod';

import { OverlayTrigger, TanstackTableCard, useShiftClickCheckbox } from '@prairielearn/ui';

import { RubricSettings } from '../../../../components/RubricSettings.js';
import type { AiGradingGeneralStats } from '../../../../ee/lib/ai-grading/types.js';
import {
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsNumericFilter,
  parseAsSortingState,
} from '../../../../lib/client/nuqs.js';
import type { PageContext } from '../../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../../lib/manualGrading.types.js';
import {
  GRADING_STATUS_VALUES,
  type GradingStatusValue,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
  InstanceQuestionRowWithAIGradingStatsSchema as InstanceQuestionRowSchema,
  type InstanceQuestionRowWithAIGradingStats,
} from '../assessmentQuestion.types.js';
import { createColumns } from '../utils/columnDefinitions.js';
import { createColumnFilters } from '../utils/columnFilters.js';
import { generateAiGraderName } from '../utils/columnUtils.js';
import { type useManualGradingActions } from '../utils/useManualGradingActions.js';

import type { ConflictModalState } from './GradingConflictModal.js';
import type { GroupInfoModalState } from './GroupInfoModal.js';
import { RubricItemsFilter } from './RubricItemsFilter.js';

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: [], right: [] };
const DEFAULT_GRADING_STATUS_FILTER: GradingStatusValue[] = [];
const DEFAULT_ASSIGNED_GRADER_FILTER: string[] = [];
const DEFAULT_GRADED_BY_FILTER: string[] = [];
const DEFAULT_SUBMISSION_GROUP_FILTER: string[] = [];
const DEFAULT_AI_AGREEMENT_FILTER: string[] = [];

const AI_GRADING_MODELS = [
  { provider: 'openai', modelId: 'gpt-5-mini-2025-08-07', name: 'OpenAI GPT 5-mini' },
  { provider: 'openai', modelId: 'gpt-5-2025-08-07', name: 'OpenAI GPT 5' },
  { provider: 'google', modelId: 'gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' },
  { provider: 'google', modelId: 'gemini-3-pro-preview', name: 'Google Gemini 3 Pro Preview' },
  { provider: 'anthropic', modelId: 'claude-haiku-4-5', name: 'Anthropic Claude Haiku 4.5' },
  { provider: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Anthropic Claude Sonnet 4.5' },
] as const;

type AiGradingModelId = (typeof AI_GRADING_MODELS)[number]['modelId'];

const DEFAULT_AI_GRADING_MODEL_ID = 'gpt-5-mini-2025-08-07';

export interface AssessmentQuestionTableProps {
  hasCourseInstancePermissionEdit: boolean;
  course: PageContext<'assessmentQuestion', 'instructor'>['course'];
  courseInstance: PageContext<'assessmentQuestion', 'instructor'>['course_instance'];
  csrfToken: string;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  urlPrefix: string;
  assessment: StaffAssessment;
  assessmentQuestion: StaffAssessmentQuestion;
  questionQid: string;
  aiGradingMode: boolean;
  aiGradingModelSelectionEnabled: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  onSetGroupInfoModalState: (modalState: GroupInfoModalState) => void;
  onSetConflictModalState: (modalState: ConflictModalState | null) => void;
  mutations: {
    batchActionMutation: ReturnType<typeof useManualGradingActions>['batchActionMutation'];
    handleBatchAction: ReturnType<typeof useManualGradingActions>['handleBatchAction'];
    deleteAiGradingJobsMutation: ReturnType<
      typeof useManualGradingActions
    >['deleteAiGradingJobsMutation'];
    deleteAiGroupingsMutation: ReturnType<
      typeof useManualGradingActions
    >['deleteAiGroupingsMutation'];
  };
}

function AiGradingOptionContent({ text, numToGrade }: { text: string; numToGrade: number }) {
  return (
    <div class="d-flex justify-content-between align-items-center w-100">
      <span>{text}</span>
      <span class="badge bg-secondary ms-2">{numToGrade}</span>
    </div>
  );
}

function AiGradingOption({
  text,
  numToGrade,
  aiGradingModelSelectionEnabled,
  onSelectModel,
}: {
  text: string;
  numToGrade: number;
  aiGradingModelSelectionEnabled: boolean;
  onSelectModel: (modelId: AiGradingModelId) => void;
}) {
  if (!aiGradingModelSelectionEnabled) {
    return (
      <Dropdown.Item
        disabled={numToGrade === 0}
        onClick={() => onSelectModel(DEFAULT_AI_GRADING_MODEL_ID)}
      >
        <AiGradingOptionContent text={text} numToGrade={numToGrade} />
      </Dropdown.Item>
    );
  }

  return (
    <Dropdown drop="end">
      <Dropdown.Toggle class={`dropdown-item ${numToGrade > 0 ? '' : 'disabled'}`}>
        <AiGradingOptionContent text={text} numToGrade={numToGrade} />
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <p class="my-0 text-muted px-3">AI grader model</p>
        <Dropdown.Divider />
        {AI_GRADING_MODELS.map((model) => (
          <Dropdown.Item key={model.modelId} onClick={() => onSelectModel(model.modelId)}>
            {model.name}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export function AssessmentQuestionTable({
  hasCourseInstancePermissionEdit,
  csrfToken,
  instanceQuestionsInfo: initialInstanceQuestionsInfo,
  urlPrefix,
  assessment,
  assessmentQuestion,
  questionQid,
  aiGradingMode,
  aiGradingModelSelectionEnabled,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  course,
  courseInstance,
  aiGradingStats,
  onSetGroupInfoModalState,
  onSetConflictModalState,
  mutations,
}: AssessmentQuestionTableProps) {
  // Query state management
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
    parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
  );
  const [autoPointsFilter, setAutoPointsFilter] = useQueryState(
    'auto_points',
    parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
  );
  const [totalPointsFilter, setTotalPointsFilter] = useQueryState(
    'total_points',
    parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
  );
  const [scoreFilter, setScoreFilter] = useQueryState(
    'score',
    parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
  );

  const { createCheckboxProps } = useShiftClickCheckbox<InstanceQuestionRow>();

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [showDeleteAiGradingModal, setShowDeleteAiGradingModal] = useState(false);
  const [showDeleteAiGroupingsModal, setShowDeleteAiGroupingsModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const queryClientInstance = useQueryClient();

  // Fetch instance questions data
  const {
    data: instanceQuestionsInfo = initialInstanceQuestionsInfo,
    error: instanceQuestionsError,
    isError: isInstanceQuestionsError,
  } = useQuery<InstanceQuestionRow[]>({
    queryKey: ['instance-questions'],
    queryFn: async () => {
      const res = await fetch(window.location.pathname + '/instances.json', {
        headers: {
          Accept: 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error);
      }
      if (!data.instance_questions) throw new Error('Invalid response format');
      const parsedData = z.array(InstanceQuestionRowSchema).safeParse(data.instance_questions);
      if (!parsedData.success) throw new Error('Failed to parse instance questions');
      return parsedData.data;
    },
    staleTime: Infinity,
    initialData: initialInstanceQuestionsInfo,
  });

  // Get all unique graders from the data
  const allGraders = useMemo(() => {
    const graders = new Set<string>();
    instanceQuestionsInfo.forEach((row) => {
      if (row.assigned_grader_name) graders.add(row.assigned_grader_name);
      if (row.last_grader_name) graders.add(row.last_grader_name);
      if (row.instance_question.ai_grading_status !== 'None') {
        graders.add(generateAiGraderName(row.instance_question.ai_grading_status));
      }
    });
    return Array.from(graders).sort();
  }, [instanceQuestionsInfo]);

  // Get all unique submission groups
  const allSubmissionGroups = useMemo(() => {
    const groups = new Set<string>();
    instanceQuestionsInfo.forEach((row) => {
      if (row.instance_question.instance_question_group_name) {
        groups.add(row.instance_question.instance_question_group_name);
      }
    });
    return Array.from(groups).sort();
  }, [instanceQuestionsInfo]);

  // Get all unique AI agreement items (rubric differences)
  const allAiAgreementItems = useMemo(() => {
    const itemsMap = new Map<string, { number: number; description: string }>();
    instanceQuestionsInfo.forEach((row) => {
      if (
        row.instance_question.rubric_difference &&
        Array.isArray(row.instance_question.rubric_difference)
      ) {
        row.instance_question.rubric_difference.forEach((item) => {
          if (!itemsMap.has(item.description)) {
            itemsMap.set(item.description, { number: item.number, description: item.description });
          }
        });
      }
    });
    return Array.from(itemsMap.values()).sort((a, b) => a.number - b.number);
  }, [instanceQuestionsInfo]);

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

  // Create columns using the extracted function
  const columns = useMemo(
    () =>
      createColumns({
        aiGradingMode,
        instanceQuestionGroups,
        assessment,
        assessmentQuestion,
        hasCourseInstancePermissionEdit,
        urlPrefix,
        csrfToken,
        createCheckboxProps,
        scrollRef,
        onEditPointsSuccess: () => {
          void queryClientInstance.invalidateQueries({
            queryKey: ['instance-questions'],
          });
        },
        onEditPointsConflict: (conflictDetailsUrl: string) => {
          onSetConflictModalState({ type: 'conflict', conflictDetailsUrl });
        },
      }),
    [
      aiGradingMode,
      instanceQuestionGroups,
      assessment,
      assessmentQuestion,
      hasCourseInstancePermissionEdit,
      urlPrefix,
      csrfToken,
      createCheckboxProps,
      scrollRef,
      queryClientInstance,
      onSetConflictModalState,
    ],
  );

  const allColumnIds = columns.map((col) => col.id!);
  const defaultColumnVisibility = useMemo(() => {
    return Object.fromEntries(
      columns.map((col) => {
        if (col.id === 'select') {
          return [col.id, true];
        }
        // If you can't show/hide the column, the default state is hidden.
        if (col.enableHiding === false) {
          return [col.id, false];
        }
        // Some columns have a default visibility that depends on AI grading mode.
        if (['requires_manual_grading', 'assigned_grader_name', 'score_perc'].includes(col.id!)) {
          return [col.id, !aiGradingMode];
        }
        if (['instance_question_group_name', 'rubric_difference'].includes(col.id!)) {
          return [col.id, aiGradingMode];
        }
        // Some columns are always hidden by default.
        if (['user_or_group_name', 'uid', 'points', 'rubric_grading_item_ids'].includes(col.id!)) {
          return [col.id, false];
        }

        return [col.id, true];
      }),
    );
  }, [columns, aiGradingMode]);

  // Use a ref to store the current default so the parser always uses the latest value
  // This is pretty hacky, but @reteps couldn't figure out a better way to do this.
  //
  // We update the ref during rendering because we need it to be up to date before we
  // run the `useEffect()` hook that updates column visibility in response to the
  // AI grading mode changing.
  const defaultColumnVisibilityRef = useRef(defaultColumnVisibility);
  defaultColumnVisibilityRef.current = defaultColumnVisibility;

  const [columnVisibility, setColumnVisibility] = useQueryState(
    'columns',
    parseAsColumnVisibilityStateWithColumns(allColumnIds, defaultColumnVisibilityRef).withDefault(
      defaultColumnVisibility,
    ),
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
      instance_question_group_name: aiGradingMode && instanceQuestionGroups.length > 0,
      rubric_difference: aiGradingMode,
    }));
  }, [aiGradingMode, instanceQuestionGroups, setColumnVisibility]);

  const table = useReactTable({
    data: instanceQuestionsInfo,
    columns,
    columnResizeMode: 'onChange',
    getRowId: (row) => row.instance_question.id,
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

  // Determine student info checkbox state based on column visibility
  const studentInfoCheckboxState = useMemo(() => {
    const visibility = columnVisibility;
    const nameVisible = visibility.user_or_group_name;
    const uidVisible = visibility.uid;

    if (nameVisible && uidVisible) return 'checked';
    if (nameVisible || uidVisible) return 'indeterminate';
    return 'unchecked';
  }, [columnVisibility]);

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
  const selectedIds = selectedRows.map((row) => row.original.instance_question.id);

  // Calculate counts for AI grading dropdown
  const aiGradingCounts = useMemo(() => {
    const humanGradedCount = instanceQuestionsInfo.filter(
      (row) => row.instance_question.last_human_grader != null,
    ).length;
    const selectedCount = selectedIds.length;
    const allCount = instanceQuestionsInfo.length;

    return {
      humanGraded: humanGradedCount,
      selected: selectedCount,
      all: allCount,
    };
  }, [instanceQuestionsInfo, selectedIds]);

  // Calculate counts for AI submission grouping dropdown
  const aiGroupingCounts = useMemo(() => {
    const selectedCount = selectedIds.length;
    const allCount = instanceQuestionsInfo.length;
    const ungroupedCount = instanceQuestionsInfo.filter(
      (row) => row.instance_question.instance_question_group_name == null,
    ).length;

    return {
      selected: selectedCount,
      all: allCount,
      ungrouped: ungroupedCount,
    };
  }, [instanceQuestionsInfo, selectedIds]);

  const {
    batchActionMutation,
    handleBatchAction,
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
  } = mutations;

  const columnFiltersComponents = createColumnFilters({
    allGraders,
    allSubmissionGroups,
    allAiAgreementItems,
    gradingStatusFilter,
    setGradingStatusFilter,
    assignedGraderFilter,
    setAssignedGraderFilter,
    gradedByFilter,
    setGradedByFilter,
    submissionGroupFilter,
    setSubmissionGroupFilter,
    aiAgreementFilter,
    setAiAgreementFilter,
    manualPointsFilter,
    setManualPointsFilter,
    autoPointsFilter,
    setAutoPointsFilter,
    totalPointsFilter,
    setTotalPointsFilter,
    scoreFilter,
    setScoreFilter,
  });

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
            assessment_tid: assessment.tid!,
            question_qid: questionQid,
          }}
        />
      </div>
      {batchActionMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => batchActionMutation.reset()}
        >
          <strong>Error:</strong> {batchActionMutation.error.message}
        </Alert>
      )}
      {deleteAiGradingJobsMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => deleteAiGradingJobsMutation.reset()}
        >
          <strong>Error:</strong> {deleteAiGradingJobsMutation.error.message}
        </Alert>
      )}
      {deleteAiGroupingsMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => deleteAiGroupingsMutation.reset()}
        >
          <strong>Error:</strong> {deleteAiGroupingsMutation.error.message}
        </Alert>
      )}
      {deleteAiGradingJobsMutation.isSuccess && (
        <Alert
          variant="success"
          class="mb-3"
          dismissible
          onClose={() => deleteAiGradingJobsMutation.reset()}
        >
          Deleted AI grading results for {deleteAiGradingJobsMutation.data.num_deleted}{' '}
          {deleteAiGradingJobsMutation.data.num_deleted === 1 ? 'question' : 'questions'}.
        </Alert>
      )}
      {deleteAiGroupingsMutation.isSuccess && (
        <Alert
          variant="success"
          class="mb-3"
          dismissible
          onClose={() => deleteAiGroupingsMutation.reset()}
        >
          Deleted AI submission grouping results for {deleteAiGroupingsMutation.data.num_deleted}{' '}
          {deleteAiGroupingsMutation.data.num_deleted === 1 ? 'question' : 'questions'}.
        </Alert>
      )}
      {isInstanceQuestionsError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => {
            void queryClientInstance.refetchQueries({ queryKey: ['instance-questions'] });
          }}
        >
          <strong>Error loading instance questions:</strong> {instanceQuestionsError.message}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Student instance questions"
        style={{ height: '90vh' }}
        columnManagerTopContent={
          <div class="px-2 py-1 d-flex align-items-center">
            <label class="form-check text-nowrap d-flex align-items-stretch">
              <input
                type="checkbox"
                checked={studentInfoCheckboxState === 'checked'}
                indeterminate={studentInfoCheckboxState === 'indeterminate'}
                class="form-check-input"
                onChange={handleStudentInfoCheckboxClick}
              />
              <span class="form-check-label ms-2">Show student info</span>
            </label>
          </div>
        }
        columnManagerButtons={
          <RubricItemsFilter
            rubricData={rubricData}
            instanceQuestionsInfo={instanceQuestionsInfo}
            rubricItemsFilter={rubricItemsFilter}
            setRubricItemsFilter={setRubricItemsFilter}
          />
        }
        headerButtons={
          <>
            {aiGradingMode ? (
              <>
                <Dropdown>
                  <Dropdown.Toggle key="ai-grading-dropdown" variant="light" size="sm">
                    <i class="bi bi-stars" aria-hidden="true" />
                    <span>AI grading</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <AiGradingOption
                      text="Grade all human-graded"
                      numToGrade={aiGradingCounts.humanGraded}
                      aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                      onSelectModel={(modelId) => {
                        batchActionMutation.mutate({
                          action: 'ai_grade_assessment_graded',
                          modelId,
                        });
                      }}
                    />
                    <AiGradingOption
                      text="Grade selected"
                      numToGrade={aiGradingCounts.selected}
                      aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                      onSelectModel={(modelId) => {
                        handleBatchAction(
                          { batch_action: 'ai_grade_assessment_selected', model_id: modelId },
                          selectedIds,
                        );
                      }}
                    />
                    <AiGradingOption
                      text="Grade all"
                      numToGrade={aiGradingCounts.all}
                      aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                      onSelectModel={(modelId) => {
                        batchActionMutation.mutate({
                          action: 'ai_grade_assessment_all',
                          modelId,
                        });
                      }}
                    />
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => setShowDeleteAiGradingModal(true)}>
                      Delete all AI grading results
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
                <Dropdown>
                  <Dropdown.Toggle variant="light" size="sm">
                    <i class="bi bi-stars" aria-hidden="true" />
                    <span class="d-none d-sm-inline">AI submission grouping</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <Dropdown.Item
                      disabled={selectedIds.length === 0}
                      onClick={() =>
                        onSetGroupInfoModalState({ type: 'selected', ids: selectedIds })
                      }
                    >
                      <div class="d-flex justify-content-between align-items-center w-100">
                        <span>Group selected submissions</span>
                        <span class="badge bg-secondary ms-2">{aiGroupingCounts.selected}</span>
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => onSetGroupInfoModalState({ type: 'all' })}>
                      <div class="d-flex justify-content-between align-items-center w-100">
                        <span>Group all submissions</span>
                        <span class="badge bg-secondary ms-2">{aiGroupingCounts.all}</span>
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Item onClick={() => onSetGroupInfoModalState({ type: 'ungrouped' })}>
                      <div class="d-flex justify-content-between align-items-center w-100">
                        <span>Group ungrouped submissions</span>
                        <span class="badge bg-secondary ms-2">{aiGroupingCounts.ungrouped}</span>
                      </div>
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => setShowDeleteAiGroupingsModal(true)}>
                      Delete all AI groupings
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </>
            ) : (
              hasCourseInstancePermissionEdit && (
                <Dropdown>
                  <Dropdown.Toggle variant="light" size="sm" disabled={selectedIds.length === 0}>
                    <i class="fas fa-tags" aria-hidden="true" />{' '}
                    <span class="d-none d-sm-inline">Tag for grading</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <Dropdown.Header class="d-flex align-items-center gap-1">
                      Assign for grading
                      <OverlayTrigger
                        tooltip={{
                          body: (
                            <>
                              Only staff with <strong>Student Data Editor</strong> permissions or
                              higher can be assigned as graders
                            </>
                          ),
                          props: { id: 'assign-for-grading-tooltip' },
                        }}
                      >
                        <span>
                          <i class="fas fa-question-circle text-secondary" />
                        </span>
                      </OverlayTrigger>
                    </Dropdown.Header>
                    {courseStaff.map((grader) => (
                      <Dropdown.Item
                        key={grader.user_id}
                        onClick={() =>
                          handleBatchAction({ assigned_grader: grader.user_id }, selectedIds)
                        }
                      >
                        <i class="fas fa-user-tag" /> Assign to: {grader.name || ''} ({grader.uid})
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Item
                      key="remove-grader-assignment"
                      onClick={() => handleBatchAction({ assigned_grader: null }, selectedIds)}
                    >
                      <i class="fas fa-user-slash" /> Remove grader assignment
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      key="tag-as-required-grading"
                      onClick={() =>
                        handleBatchAction({ requires_manual_grading: true }, selectedIds)
                      }
                    >
                      <i class="fas fa-tag" /> Tag as required grading
                    </Dropdown.Item>
                    <Dropdown.Item
                      key="tag-as-graded"
                      onClick={() =>
                        handleBatchAction({ requires_manual_grading: false }, selectedIds)
                      }
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
          filters: columnFiltersComponents,
          scrollRef,
        }}
        singularLabel="submission"
        pluralLabel="submissions"
        downloadButtonOptions={{
          filenameBase: `manual_grading_${questionQid}`,
          mapRowToData: (row) => ({
            Instance: row.instance_question.id,
            [assessment.group_work ? 'Group Name' : 'Name']: row.user_or_group_name || '',
            [assessment.group_work ? 'UIDs' : 'UID']: row.uid || '',
            'Grading Status': row.instance_question.requires_manual_grading
              ? 'Requires grading'
              : 'Graded',
            'Assigned Grader': row.assigned_grader_name || '',
            'Auto Points':
              row.instance_question.auto_points != null
                ? row.instance_question.auto_points.toString()
                : '',
            'Manual Points':
              row.instance_question.manual_points != null
                ? row.instance_question.manual_points.toString()
                : '',
            'Total Points':
              row.instance_question.points != null ? row.instance_question.points.toString() : '',
            'Score %':
              row.instance_question.score_perc != null
                ? row.instance_question.score_perc.toString()
                : '',
            'Graded By': row.last_grader_name || '',
            'Modified At': row.instance_question.modified_at.toISOString(),
          }),
        }}
      />

      {/* Delete AI Grading Results Modal */}
      <Modal show={showDeleteAiGradingModal} onHide={() => setShowDeleteAiGradingModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete all AI grading results</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>all AI grading results</strong> for this
          assessment? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteAiGradingModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteAiGradingJobsMutation.isPending}
            onClick={() =>
              deleteAiGradingJobsMutation.mutate(undefined, {
                onSuccess: () => setShowDeleteAiGradingModal(false),
              })
            }
          >
            {deleteAiGradingJobsMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete AI Groupings Modal */}
      <Modal show={showDeleteAiGroupingsModal} onHide={() => setShowDeleteAiGroupingsModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete all AI submission groupings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete <strong>all AI submission groupings</strong> for this
          assessment? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteAiGroupingsModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteAiGroupingsMutation.isPending}
            onClick={() =>
              deleteAiGroupingsMutation.mutate(undefined, {
                onSuccess: () => setShowDeleteAiGroupingsModal(false),
              })
            }
          >
            {deleteAiGroupingsMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
