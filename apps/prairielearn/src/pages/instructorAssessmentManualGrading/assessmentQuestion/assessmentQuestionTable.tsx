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
import { Alert, Button, Dropdown, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { z } from 'zod';

import { TanstackTableCard, useShiftClickCheckbox } from '@prairielearn/ui';

import { RubricSettings } from '../../../components/RubricSettings.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import {
  parseAsColumnPinningState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsNumericFilter,
  parseAsSortingState,
} from '../../../lib/client/nuqs.js';
import type {
  PageContextWithAuthzData,
  StaffCourseInstanceContext,
} from '../../../lib/client/page-context.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { GRADING_STATUS_VALUES, type GradingStatusValue } from './assessmentQuestion.shared.js';
import {
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
  InstanceQuestionRowWithAIGradingStatsSchema as InstanceQuestionRowSchema,
} from './assessmentQuestion.types.js';
import { RubricItemsFilter } from './components/RubricItemsFilter.js';
import { createColumns } from './utils/columnDefinitions.js';
import { createColumnFilters } from './utils/columnFilters.js';
import { generateAiGraderName } from './utils/columnUtils.js';
import { useBatchActions } from './utils/useBatchActions.js';

const DEFAULT_SORT: SortingState = [];
const DEFAULT_PINNING: ColumnPinningState = { left: [], right: [] };
const DEFAULT_GRADING_STATUS_FILTER: GradingStatusValue[] = [];
const DEFAULT_ASSIGNED_GRADER_FILTER: string[] = [];
const DEFAULT_GRADED_BY_FILTER: string[] = [];
const DEFAULT_SUBMISSION_GROUP_FILTER: string[] = [];
const DEFAULT_AI_AGREEMENT_FILTER: string[] = [];

export interface AssessmentQuestionTableProps {
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

export function AssessmentQuestionTable({
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

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteAiGradingModal, setShowDeleteAiGradingModal] = useState(false);
  const [showDeleteAiGroupingsModal, setShowDeleteAiGroupingsModal] = useState(false);

  const queryClientInstance = useQueryClient();

  // Fetch instance questions data
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
        groupWork,
        assessmentQuestion,
        authzDataHasCourseInstancePermissionEdit:
          authzData.has_course_instance_permission_edit ?? false,
        urlPrefix,
        csrfToken,
        assessmentId,
        createCheckboxProps,
      }),
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
        await queryClientInstance.invalidateQueries({
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
  }, [queryClientInstance, urlPrefix, assessmentId, assessmentQuestionId, instanceQuestions]);

  // Use batch actions hook
  const {
    batchActionMutation,
    handleBatchAction,
    deleteAiGradingJobsMutation,
    deleteAiGroupingsMutation,
  } = useBatchActions({
    csrfToken,
    urlPrefix,
    assessmentId,
    assessmentQuestionId,
    setErrorMessage,
    setSuccessMessage,
  });

  // Create column filters using the extracted function
  const columnFiltersComponents = createColumnFilters({
    allGraders,
    allSubmissionGroups,
    allAiAgreementItems,
    aiGradingMode,
    instanceQuestionGroups,
    assessmentQuestion,
    gradingStatusFilter,
    setGradingStatusFilter: (value) => void setGradingStatusFilter(value),
    assignedGraderFilter,
    setAssignedGraderFilter: (value) => void setAssignedGraderFilter(value),
    gradedByFilter,
    setGradedByFilter: (value) => void setGradedByFilter(value),
    submissionGroupFilter,
    setSubmissionGroupFilter: (value) => void setSubmissionGroupFilter(value),
    aiAgreementFilter,
    setAiAgreementFilter: (value) => void setAiAgreementFilter(value),
    manualPointsFilter,
    setManualPointsFilter: (value) => void setManualPointsFilter(value),
    autoPointsFilter,
    setAutoPointsFilter: (value) => void setAutoPointsFilter(value),
    totalPointsFilter,
    setTotalPointsFilter: (value) => void setTotalPointsFilter(value),
    scoreFilter,
    setScoreFilter: (value) => void setScoreFilter(value),
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
      {successMessage && (
        <Alert variant="success" class="mb-3" dismissible onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      <TanstackTableCard
        table={table}
        title="Student instance questions"
        columnManagerTopContent={
          <div class="px-2 py-1 d-flex align-items-center">
            <label class="form-check text-nowrap d-flex align-items-stretch">
              <input
                ref={studentInfoCheckboxRef}
                type="checkbox"
                checked={studentInfoCheckboxState === 'checked'}
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
                        handleBatchAction(
                          { batch_action: 'ai_grade_assessment_selected' },
                          selectedIds,
                        )
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
                    <Dropdown.Item onClick={() => setShowDeleteAiGradingModal(true)}>
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
                    <Dropdown.Item onClick={() => setShowDeleteAiGroupingsModal(true)}>
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
                        onClick={() =>
                          handleBatchAction({ assigned_grader: grader.user_id }, selectedIds)
                        }
                      >
                        <i class="fas fa-user-tag" /> Assign to: {grader.name || ''} ({grader.uid})
                      </Dropdown.Item>
                    ))}
                    <Dropdown.Item
                      onClick={() => handleBatchAction({ assigned_grader: null }, selectedIds)}
                    >
                      <i class="fas fa-user-slash" /> Remove grader assignment
                    </Dropdown.Item>
                    <Dropdown.Divider />
                    <Dropdown.Item
                      onClick={() =>
                        handleBatchAction({ requires_manual_grading: true }, selectedIds)
                      }
                    >
                      <i class="fas fa-tag" /> Tag as required grading
                    </Dropdown.Item>
                    <Dropdown.Item
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
        }}
        pluralLabel="submissions"
        downloadButtonOptions={{
          filenameBase: `manual_grading_${questionQid}`,
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
