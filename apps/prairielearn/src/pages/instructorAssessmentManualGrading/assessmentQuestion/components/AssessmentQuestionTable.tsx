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
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dropdown, Modal } from 'react-bootstrap';

import { run } from '@prairielearn/run';
import {
  type MultiSelectFilterValue,
  type NumericColumnFilterValue,
  OverlayTrigger,
  TanstackTableCard,
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsMultiSelectFilter,
  parseAsNumericFilter,
  parseAsSortingState,
  useColumnFilters,
  useModalState,
  useShiftClickCheckbox,
} from '@prairielearn/ui';

import { RubricSettings } from '../../../../components/RubricSettings.js';
import { AiGradingProgressInfo } from '../../../../components/ServerJobProgress/AiGradingProgressInfo.js';
import { useServerJobProgress } from '../../../../components/ServerJobProgress/useServerJobProgress.js';
import type { AiGradingGeneralStats } from '../../../../ee/lib/ai-grading/types.js';
import type { PageContext } from '../../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../../lib/client/safe-db-types.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import type { RubricData } from '../../../../lib/manualGrading.types.js';
import { useTRPC } from '../../../../trpc/assessmentQuestion/context.js';
import type { ManualGradingError } from '../../../../trpc/assessmentQuestion/manual-grading.js';
import {
  GRADING_STATUS_VALUES,
  type GradingStatusValue,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
  type InstanceQuestionRowWithAIGradingStats,
} from '../assessmentQuestion.types.js';
import { createColumns } from '../utils/columnDefinitions.js';
import { createColumnFilters } from '../utils/columnFilters.js';
import { generateAiGraderName } from '../utils/columnUtils.js';
import { type useManualGradingActions } from '../utils/useManualGradingActions.js';

import {
  AiGradingModelSelectionModal,
  type AiGradingModelSelectionModalState,
} from './AiGradingModelSelectionModal.js';
import type { ConflictModalState } from './GradingConflictModal.js';
import type { GroupInfoModalState } from './GroupInfoModal.js';
import { QueryErrors } from './QueryErrors.js';
import { ReviewSubmissionsAlert } from './ReviewSubmissionsAlert.js';
import { RubricItemsFilter } from './RubricItemsFilter.js';

function userToExportFields(user: StaffUser | null) {
  return user ? { name: user.name, uid: user.uid, uin: user.uin, email: user.email } : null;
}

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: [], right: [] };
const DEFAULT_GRADING_STATUS_FILTER: MultiSelectFilterValue<GradingStatusValue> = {
  values: [],
  mode: 'include',
};
const DEFAULT_ASSIGNED_GRADER_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const DEFAULT_GRADED_BY_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const DEFAULT_SUBMISSION_GROUP_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const DEFAULT_AI_AGREEMENT_FILTER: MultiSelectFilterValue = { values: [], mode: 'include' };
const EMPTY_NUMERIC_FILTER: NumericColumnFilterValue = { filterValue: '', emptyOnly: false };

interface AssessmentQuestionTableProps {
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
  aiSubmissionGroupingEnabled: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
  availableAiGradingProviders: EnumAiGradingProvider[];
  rubricEditingDisabled?: boolean;
  aiGradingRelativeCosts: Record<string, string>;
  onSetGroupInfoModalState: (modalState: GroupInfoModalState) => void;
  onSetConflictModalState: (modalState: ConflictModalState) => void;
  onRubricSettingsSaved: (data: {
    rubric_data: RubricData | null;
    aiGradingStats: AiGradingGeneralStats | null;
  }) => void;
  mutations: ReturnType<typeof useManualGradingActions>;
}

function AiGradingOption({
  text,
  numToGrade,
  onSelect,
  hint,
}: {
  text: string;
  numToGrade: number;
  onSelect: () => void;
  hint?: string;
}) {
  return (
    <Dropdown.Item disabled={numToGrade === 0} onClick={onSelect}>
      <div className="d-flex justify-content-between align-items-center w-100">
        <span>{text}</span>
        <span className="badge bg-secondary ms-2">{numToGrade}</span>
      </div>
      {hint && (
        <div className="small text-muted mt-1" style={{ whiteSpace: 'normal' }}>
          {hint}
        </div>
      )}
    </Dropdown.Item>
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
  aiSubmissionGroupingEnabled,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  course,
  courseInstance,
  aiGradingStats,
  initialOngoingJobSequenceTokens,
  availableAiGradingProviders,
  rubricEditingDisabled,
  aiGradingRelativeCosts,
  onSetGroupInfoModalState,
  onSetConflictModalState,
  onRubricSettingsSaved,
  mutations,
}: AssessmentQuestionTableProps) {
  const trpc = useTRPC();
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

  const filterRegistry = useMemo(
    () => ({
      requires_manual_grading: {
        urlKey: 'status',
        parser: parseAsMultiSelectFilter(GRADING_STATUS_VALUES),
        defaultValue: DEFAULT_GRADING_STATUS_FILTER,
      },
      assigned_grader_name: {
        urlKey: 'assigned_grader',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_ASSIGNED_GRADER_FILTER,
      },
      last_grader_name: {
        urlKey: 'graded_by',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_GRADED_BY_FILTER,
      },
      instance_question_group_name: {
        urlKey: 'submission_group',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_SUBMISSION_GROUP_FILTER,
        enabled: aiGradingMode && instanceQuestionGroups.length > 0,
      },
      rubric_difference: {
        urlKey: 'ai_agreement',
        parser: parseAsMultiSelectFilter(),
        defaultValue: DEFAULT_AI_AGREEMENT_FILTER,
        enabled: aiGradingMode,
      },
      rubric_grading_item_ids: {
        urlKey: 'rubric_items',
        parser: parseAsArrayOf(parseAsString),
        defaultValue: [] as string[],
        enabled: !!rubricData && rubricData.rubric_items.length > 0,
      },
      manual_points: {
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
      },
      auto_points: {
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
        enabled: !!assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0,
      },
      points: {
        urlKey: 'total_points',
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
      },
      score_perc: {
        urlKey: 'score',
        parser: parseAsNumericFilter,
        defaultValue: EMPTY_NUMERIC_FILTER,
        enabled: !aiGradingMode,
      },
    }),
    [aiGradingMode, instanceQuestionGroups.length, assessmentQuestion.max_auto_points, rubricData],
  );

  const { columnFilters, onColumnFiltersChange, onResetColumnFilters } =
    useColumnFilters(filterRegistry);

  // Mirrors the `rubric_grading_item_ids` registry entry above. Both subscribers
  // share the `rubric_items` URL param via nuqs, so reset clears it whenever
  // the rubric filter is enabled. When disabled, the URL value is preserved
  // (see `ColumnFilterEntry.enabled` in `use-column-filters.ts`).
  const [rubricItemsFilter, setRubricItemsFilter] = useQueryState(
    'rubric_items',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const { createCheckboxProps } = useShiftClickCheckbox<InstanceQuestionRow>();

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [showDeleteAiGradingModal, setShowDeleteAiGradingModal] = useState(false);
  const [showDeleteAiGroupingsModal, setShowDeleteAiGroupingsModal] = useState(false);

  // Track completed AI grading job IDs so the "Review AI-graded submissions"
  // alert survives dismissal of the "AI grading complete" progress alert
  // (which clears the job from `serverJobProgress.jobsProgress`). The ref
  // dedupes by job_sequence_id; the boolean drives alert visibility and is
  // reset on dismissal.
  const seenCompletedJobIdsRef = useRef<Set<string>>(new Set());
  const [hasUnacknowledgedReview, setHasUnacknowledgedReview] = useState(false);

  const modelSelectionModalState = useModalState<AiGradingModelSelectionModalState>();
  const [lastSelectedModel, setLastSelectedModel] = useState<string | null>(
    assessmentQuestion.ai_grading_last_selected_model ?? null,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const queryClientInstance = useQueryClient();

  // Fetch instance questions data
  const {
    data: instanceQuestionsInfo = initialInstanceQuestionsInfo,
    error: instanceQuestionsError,
    isError: isInstanceQuestionsError,
  } = useQuery({
    ...trpc.manualGrading.instances.queryOptions(),
    staleTime: Infinity,
    initialData: initialInstanceQuestionsInfo,
  });

  // Get all unique graders from the data
  const allGraders = useMemo(() => {
    const graders = new Set<string>();
    instanceQuestionsInfo.forEach((row) => {
      if (row.assigned_grader_name) graders.add(row.assigned_grader_name);
      if (row.last_grader_name) graders.add(row.last_grader_name);
      if (row.instance_question.ai_grading_status !== 'None' && aiGradingMode) {
        graders.add(generateAiGraderName(row.instance_question.ai_grading_status));
      }
    });
    return Array.from(graders).sort();
  }, [instanceQuestionsInfo, aiGradingMode]);

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

  const serverJobProgress = useServerJobProgress({
    enabled: aiGradingMode,
    initialOngoingJobSequenceTokens,
    onProgressChange: () => {
      // Refresh the displayed table data when server job progress updates, since
      // instance question grading data (e.g. AI agreements, grading status)
      // may have changed.
      void queryClientInstance.invalidateQueries({
        queryKey: trpc.manualGrading.instances.queryKey(),
      });
    },
  });

  // Show the review alert when a job completes that we haven't already
  // recorded. The seen set is genuinely history-dependent (it must outlive
  // the job leaving `jobsProgress`), so this is a legitimate accumulator
  // rather than derived state.
  useEffect(() => {
    let added = false;
    for (const j of Object.values(serverJobProgress.jobsProgress)) {
      if (
        j.num_total > 0 &&
        j.num_complete >= j.num_total &&
        j.num_failed === 0 &&
        !seenCompletedJobIdsRef.current.has(j.job_sequence_id)
      ) {
        seenCompletedJobIdsRef.current.add(j.job_sequence_id);
        added = true;
      }
    }
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-adjust-state-on-prop-change, @eslint-react/set-state-in-effect
    if (added) setHasUnacknowledgedReview(true);
  }, [serverJobProgress.jobsProgress]);

  // Create columns using the extracted function
  const columns = useMemo(
    () =>
      createColumns({
        aiGradingMode,
        instanceQuestionGroups,
        displayedStatuses: serverJobProgress.displayedStatuses,
        assessment,
        assessmentQuestion,
        hasCourseInstancePermissionEdit,
        urlPrefix,
        csrfToken,
        courseInstanceId: courseInstance.id,
        createCheckboxProps,
        scrollRef,
        onEditPointsSuccess: () => {
          void queryClientInstance.invalidateQueries({
            queryKey: trpc.manualGrading.instances.queryKey(),
          });
        },
        onEditPointsConflict: (conflictDetailsUrl: string) => {
          onSetConflictModalState({ type: 'conflict', conflictDetailsUrl });
        },
      }),
    [
      aiGradingMode,
      instanceQuestionGroups,
      serverJobProgress.displayedStatuses,
      assessment,
      assessmentQuestion,
      hasCourseInstancePermissionEdit,
      urlPrefix,
      csrfToken,
      courseInstance.id,
      createCheckboxProps,
      scrollRef,
      queryClientInstance,
      trpc.manualGrading.instances,
      onSetConflictModalState,
    ],
  );

  const allColumnIds = useMemo(
    () => columns.map((col) => col.id).filter((id): id is string => typeof id === 'string'),
    [columns],
  );
  const defaultColumnVisibility = useMemo(() => {
    return Object.fromEntries(
      columns.flatMap((col) => {
        if (typeof col.id !== 'string') return [];
        if (col.id === 'select') {
          return [[col.id, true]];
        }
        // If you can't show/hide the column, the default state is hidden.
        if (col.enableHiding === false) {
          return [[col.id, false]];
        }
        // Some columns have a default visibility that depends on AI grading mode.
        if (['assigned_grader_name', 'score_perc'].includes(col.id)) {
          return [[col.id, !aiGradingMode]];
        }
        if (['instance_question_group_name', 'rubric_difference'].includes(col.id)) {
          return [[col.id, aiGradingMode]];
        }
        // Some columns are always hidden by default.
        if (['user_or_group_name', 'uid', 'points', 'rubric_grading_item_ids'].includes(col.id)) {
          return [[col.id, false]];
        }

        return [[col.id, true]];
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
    onColumnFiltersChange,
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

  // Ref for the student info checkbox to handle indeterminate state
  const studentInfoCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (studentInfoCheckboxRef.current) {
      studentInfoCheckboxRef.current.indeterminate = studentInfoCheckboxState === 'indeterminate';
    }
  }, [studentInfoCheckboxState]);

  // Handle student info checkbox click - toggles between checked (both visible) and unchecked (both hidden)
  const handleStudentInfoCheckboxClick = useCallback(() => {
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
  }, [studentInfoCheckboxState, table, setColumnVisibility]);

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
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
    setRequiresManualGradingMutation,
    setAssignedGraderMutation,
    groupSubmissionMutation,
    stopAiGradingJobMutation,
  } = mutations;

  const columnFiltersComponents = createColumnFilters({
    allGraders,
    allSubmissionGroups,
    allAiAgreementItems,
  });

  return (
    <>
      <div className="mb-3">
        <RubricSettings
          key={`${rubricData?.rubric.id ?? 'no-rubric'}-${String(rubricData?.rubric.modified_at ?? '')}`}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          assessmentQuestion={assessmentQuestion}
          rubricData={rubricData}
          csrfToken={csrfToken}
          aiGradingStats={aiGradingStats}
          rubricEditingDisabled={rubricEditingDisabled}
          context={{
            course_short_name: course.short_name,
            course_instance_short_name: courseInstance.short_name,
            assessment_tid: assessment.tid!,
            question_qid: questionQid,
          }}
          onSaved={onRubricSettingsSaved}
        />
      </div>
      {aiGradingMode && (
        <>
          <AiGradingProgressInfo
            jobsProgress={Object.values(serverJobProgress.jobsProgress)}
            courseInstanceId={courseInstance.id}
            hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
            onDismissCompleteJobSequence={serverJobProgress.handleDismissCompleteJobSequence}
            onStopJobSequence={(jobSequenceId) =>
              stopAiGradingJobMutation.mutate({ job_sequence_id: jobSequenceId })
            }
          />
          {hasUnacknowledgedReview && (
            <ReviewSubmissionsAlert onDismiss={() => setHasUnacknowledgedReview(false)} />
          )}
        </>
      )}
      <QueryErrors<ManualGradingError>
        queries={[
          deleteAiGradingJobsMutation,
          deleteAiGroupingsMutation,
          groupSubmissionMutation,
          setAssignedGraderMutation,
          setRequiresManualGradingMutation,
          stopAiGradingJobMutation,
        ]}
      />
      {deleteAiGradingJobsMutation.isSuccess && (
        <Alert
          variant="success"
          className="mb-3"
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
          className="mb-3"
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
          className="mb-3"
          dismissible
          onClose={() => {
            void queryClientInstance.refetchQueries({
              queryKey: trpc.manualGrading.instances.queryKey(),
            });
          }}
        >
          <strong>Error loading instance questions:</strong> {instanceQuestionsError.message}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Student instance questions"
        style={{ height: '90vh' }}
        columnManager={{
          topContent: (
            <div className="px-2 py-1 d-flex align-items-center">
              <label className="form-check text-nowrap d-flex align-items-stretch">
                <input
                  ref={studentInfoCheckboxRef}
                  type="checkbox"
                  checked={studentInfoCheckboxState === 'checked'}
                  className="form-check-input"
                  onChange={handleStudentInfoCheckboxClick}
                />
                <span className="form-check-label ms-2">Show student info</span>
              </label>
            </div>
          ),
          buttons: (
            <RubricItemsFilter
              rubricData={rubricData}
              instanceQuestionsInfo={instanceQuestionsInfo}
              rubricItemsFilter={rubricItemsFilter}
              setRubricItemsFilter={setRubricItemsFilter}
            />
          ),
        }}
        headerButtons={
          hasCourseInstancePermissionEdit ? (
            aiGradingMode ? (
              <>
                <Dropdown>
                  <Dropdown.Toggle key="ai-grading-dropdown" variant="light" size="sm">
                    <i className="bi bi-stars" aria-hidden="true" />
                    <span>AI grading</span>
                  </Dropdown.Toggle>
                  <Dropdown.Menu align="end">
                    <AiGradingOption
                      text="Grade all human-graded"
                      numToGrade={aiGradingCounts.humanGraded}
                      onSelect={() =>
                        modelSelectionModalState.showWithData({
                          type: 'human_graded',
                          numToGrade: aiGradingCounts.humanGraded,
                        })
                      }
                    />
                    <AiGradingOption
                      text="Grade selected"
                      numToGrade={aiGradingCounts.selected}
                      hint={
                        aiGradingCounts.selected === 0 && aiGradingCounts.all > 0
                          ? 'Checkboxes on the left select submissions. Shift-click to select a range.'
                          : undefined
                      }
                      onSelect={() =>
                        modelSelectionModalState.showWithData({
                          type: 'selected',
                          ids: selectedIds,
                          numToGrade: aiGradingCounts.selected,
                        })
                      }
                    />
                    <AiGradingOption
                      text="Grade all"
                      numToGrade={aiGradingCounts.all}
                      hint={
                        aiGradingCounts.all === 0
                          ? 'Receive at least one submission to perform AI grading.'
                          : undefined
                      }
                      onSelect={() =>
                        modelSelectionModalState.showWithData({
                          type: 'all',
                          numToGrade: aiGradingCounts.all,
                        })
                      }
                    />
                    <Dropdown.Divider />
                    <Dropdown.Item onClick={() => setShowDeleteAiGradingModal(true)}>
                      Delete all AI grading results
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
                {aiSubmissionGroupingEnabled &&
                  (!availableAiGradingProviders.includes('openai') ? (
                    <OverlayTrigger
                      tooltip={{
                        body: 'No OpenAI API key is configured. Add a key in AI grading settings to use submission grouping.',
                        props: { id: 'ai-grouping-no-openai-tooltip' },
                      }}
                    >
                      <span style={{ display: 'inline-block' }}>
                        <Button
                          variant="light"
                          size="sm"
                          style={{ pointerEvents: 'none' }}
                          disabled
                        >
                          <i className="bi bi-stars" aria-hidden="true" />
                          <span className="d-none d-sm-inline">AI submission grouping</span>
                        </Button>
                      </span>
                    </OverlayTrigger>
                  ) : (
                    <Dropdown>
                      <Dropdown.Toggle variant="light" size="sm">
                        <i className="bi bi-stars" aria-hidden="true" />
                        <span className="d-none d-sm-inline">AI submission grouping</span>
                      </Dropdown.Toggle>
                      <Dropdown.Menu align="end">
                        <Dropdown.Item
                          disabled={selectedIds.length === 0}
                          onClick={() =>
                            onSetGroupInfoModalState({ type: 'selected', ids: selectedIds })
                          }
                        >
                          <div className="d-flex justify-content-between align-items-center w-100">
                            <span>Group selected submissions</span>
                            <span className="badge bg-secondary ms-2">
                              {aiGroupingCounts.selected}
                            </span>
                          </div>
                        </Dropdown.Item>
                        <Dropdown.Item onClick={() => onSetGroupInfoModalState({ type: 'all' })}>
                          <div className="d-flex justify-content-between align-items-center w-100">
                            <span>Group all submissions</span>
                            <span className="badge bg-secondary ms-2">{aiGroupingCounts.all}</span>
                          </div>
                        </Dropdown.Item>
                        <Dropdown.Item
                          onClick={() => onSetGroupInfoModalState({ type: 'ungrouped' })}
                        >
                          <div className="d-flex justify-content-between align-items-center w-100">
                            <span>Group ungrouped submissions</span>
                            <span className="badge bg-secondary ms-2">
                              {aiGroupingCounts.ungrouped}
                            </span>
                          </div>
                        </Dropdown.Item>
                        <Dropdown.Divider />
                        <Dropdown.Item onClick={() => setShowDeleteAiGroupingsModal(true)}>
                          Delete all AI groupings
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  ))}
              </>
            ) : (
              <Dropdown>
                <Dropdown.Toggle variant="light" size="sm" disabled={selectedIds.length === 0}>
                  <i className="fas fa-tags" aria-hidden="true" />{' '}
                  <span className="d-none d-sm-inline">Tag for grading</span>
                </Dropdown.Toggle>
                <Dropdown.Menu align="end">
                  <Dropdown.Header className="d-flex align-items-center gap-1">
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
                        <i className="fas fa-question-circle text-secondary" />
                      </span>
                    </OverlayTrigger>
                  </Dropdown.Header>
                  {courseStaff.map((grader) => (
                    <Dropdown.Item
                      key={grader.id}
                      onClick={() =>
                        setAssignedGraderMutation.mutate({
                          assigned_grader: grader.id,
                          instance_question_ids: selectedIds,
                        })
                      }
                    >
                      <i className="fas fa-user-tag" /> Assign to: {grader.name || ''} ({grader.uid}
                      )
                    </Dropdown.Item>
                  ))}
                  <Dropdown.Item
                    key="remove-grader-assignment"
                    onClick={() =>
                      setAssignedGraderMutation.mutate({
                        assigned_grader: null,
                        instance_question_ids: selectedIds,
                      })
                    }
                  >
                    <i className="fas fa-user-slash" /> Remove grader assignment
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    key="tag-as-required-grading"
                    onClick={() =>
                      setRequiresManualGradingMutation.mutate({
                        requires_manual_grading: true,
                        instance_question_ids: selectedIds,
                      })
                    }
                  >
                    <i className="fas fa-tag" /> Tag as required grading
                  </Dropdown.Item>
                  <Dropdown.Item
                    key="tag-as-graded"
                    onClick={() =>
                      setRequiresManualGradingMutation.mutate({
                        requires_manual_grading: false,
                        instance_question_ids: selectedIds,
                      })
                    }
                  >
                    <i className="fas fa-check-square" /> Tag as graded
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            )
          ) : (
            <></>
          )
        }
        globalFilter={{
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
          mapRowToData: (row) => [
            {
              name: 'Instance',
              value: row.instance_question.id,
            },
            {
              name: assessment.team_work ? 'Group Name' : 'Name',
              value: row.user_or_group_name || '',
            },
            { name: assessment.team_work ? 'UIDs' : 'UID', value: row.uid || '' },
            ...(assessment.team_work
              ? []
              : [
                  { name: 'UIN', value: row.user?.uin ?? '' },
                  { name: 'Email', value: row.user?.email ?? '' },
                ]),
            {
              name: 'Grading Status',
              value: row.instance_question.requires_manual_grading ? 'Requires grading' : 'Graded',
            },
            { name: 'Assigned Grader Name', value: row.assigned_grader?.name ?? '' },
            { name: 'Assigned Grader UID', value: row.assigned_grader?.uid ?? '' },
            { name: 'Assigned Grader UIN', value: row.assigned_grader?.uin ?? '' },
            { name: 'Assigned Grader Email', value: row.assigned_grader?.email ?? '' },
            {
              name: 'Auto Points',
              value:
                row.instance_question.auto_points != null
                  ? row.instance_question.auto_points.toString()
                  : '',
            },
            {
              name: 'Manual Points',
              value:
                row.instance_question.manual_points != null
                  ? row.instance_question.manual_points.toString()
                  : '',
            },
            {
              name: 'Total Points',
              value:
                row.instance_question.points != null ? row.instance_question.points.toString() : '',
            },
            {
              name: 'Score %',
              value:
                row.instance_question.score_perc != null
                  ? row.instance_question.score_perc.toString()
                  : '',
            },
            { name: 'Last Grader Name', value: row.last_grader?.name ?? '' },
            { name: 'Last Grader UID', value: row.last_grader?.uid ?? '' },
            { name: 'Last Grader UIN', value: row.last_grader?.uin ?? '' },
            { name: 'Last Grader Email', value: row.last_grader?.email ?? '' },
            { name: 'Modified At', value: row.instance_question.modified_at.toISOString() },
          ],
          mapRowToJsonData: (row) => ({
            instance_question_id: row.instance_question.id,
            ...(assessment.team_work
              ? {
                  group: {
                    name: row.user_or_group_name ?? null,
                    members: row.group_members.map((m) => userToExportFields(m)),
                  },
                }
              : { user: userToExportFields(row.user) }),
            requires_manual_grading: row.instance_question.requires_manual_grading,
            assigned_grader: userToExportFields(row.assigned_grader),
            auto_points: row.instance_question.auto_points ?? null,
            manual_points: row.instance_question.manual_points ?? null,
            points: row.instance_question.points ?? null,
            score_perc: row.instance_question.score_perc ?? null,
            last_grader: userToExportFields(row.last_grader),
            modified_at: row.instance_question.modified_at.toISOString(),
          }),
          hasSelection: true,
        }}
        onResetColumnFilters={onResetColumnFilters}
      />

      <AiGradingModelSelectionModal
        key={lastSelectedModel ?? 'default'}
        show={modelSelectionModalState.show}
        data={modelSelectionModalState.data}
        availableProviders={availableAiGradingProviders}
        aiGradingLastSelectedModel={lastSelectedModel}
        relativeCosts={aiGradingRelativeCosts}
        useCustomApiKeys={courseInstance.ai_grading_use_custom_api_keys}
        aiGradingSettingsUrl={`${urlPrefix}/instance_admin/ai_grading`}
        hasRubric={rubricData != null && rubricData.rubric_items.length > 0}
        totalSubmissionCount={aiGradingCounts.all}
        onHide={modelSelectionModalState.onHide}
        onExited={modelSelectionModalState.onExited}
        onSelectFirstSubmissions={(n) => {
          const candidateIds = run(() => {
            if (modelSelectionModalState.data?.type === 'selected') {
              return modelSelectionModalState.data.ids;
            }
            if (modelSelectionModalState.data?.type === 'human_graded') {
              return instanceQuestionsInfo
                .filter((row) => row.instance_question.last_human_grader != null)
                .map((row) => row.instance_question.id);
            }
            return instanceQuestionsInfo.map((row) => row.instance_question.id);
          });
          const ids = candidateIds.slice(0, n);
          const nextSelection = Object.fromEntries(ids.map((id) => [id, true]));
          setRowSelection(nextSelection);
          modelSelectionModalState.showWithData({
            type: 'selected',
            ids,
            numToGrade: ids.length,
          });
        }}
        onSuccess={(data, modelId) => {
          serverJobProgress.handleAddOngoingJobSequence(
            data.job_sequence_id,
            data.job_sequence_token,
          );
          setLastSelectedModel(modelId);
          setRowSelection({});
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
