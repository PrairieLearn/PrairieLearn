import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

import { run } from '@prairielearn/run';
import { useModalState } from '@prairielearn/ui';

import {
  type StaffAssessmentQuestionRow,
  StaffAssessmentQuestionRowSchema,
} from '../../../lib/assessment-question.shared.js';
import type {
  StaffAssessment,
  StaffCourse,
  StaffCourseInstance,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { QuestionByQidResult } from '../trpc.js';
import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';
import {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
} from '../utils/dataTransform.js';
import { normalizeQuestionPoints, questionDisplayName } from '../utils/questions.js';
import { createAssessmentQuestionsTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC } from '../utils/trpc-context.js';
import { useAssessmentEditor } from '../utils/useAssessmentEditor.js';

import { AssessmentZone } from './AssessmentZone.js';
import { EditQuestionModal } from './EditQuestionModal.js';
import { EditZoneModal, type EditZoneModalData } from './EditZoneModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { QuestionPickerModal } from './QuestionPickerModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

/** Fields that can be inherited from a zone question block by its alternatives. */
const INHERITABLE_FIELDS = [
  'points',
  'autoPoints',
  'maxPoints',
  'maxAutoPoints',
  'manualPoints',
] as const;

/** State for the question picker and edit modal flow. */
interface EditingStateCreate {
  status: 'editing';
  mode: 'create';
  zoneTrackingId: string;
  question: ZoneQuestionBlockForm;
  existingQids: string[];
}

interface EditingStateEdit {
  status: 'editing';
  mode: 'edit';
  questionTrackingId: string;
  alternativeTrackingId?: string;
  question: ZoneQuestionBlockForm | QuestionAlternativeForm;
  zoneQuestionBlock?: ZoneQuestionBlockForm;
  /** The question's QID before editing, used to detect QID changes. */
  originalQuestionId?: string;
}

type EditingState = EditingStateCreate | EditingStateEdit;

type QuestionEditState =
  | { status: 'idle' }
  | {
      status: 'picking';
      zoneTrackingId: string;
      /** If returning to edit modal after picking, preserve that context */
      returnToEdit?: EditingState;
    }
  | EditingState;

function EditModeButtons({
  csrfToken,
  origHash,
  zones,
  editMode,
  setEditMode,
  saveButtonDisabled,
  saveButtonDisabledReason,
  isAllExpanded,
  onToggleExpandCollapse,
  onCancel,
}: {
  csrfToken: string;
  origHash: string;
  zones: ZoneAssessmentForm[];
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
  saveButtonDisabled: boolean;
  saveButtonDisabledReason?: string;
  isAllExpanded: boolean;
  onToggleExpandCollapse: () => void;
  onCancel: () => void;
}) {
  if (!editMode) {
    return (
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-light" type="button" onClick={onToggleExpandCollapse}>
          {isAllExpanded ? (
            <>
              <i className="bi bi-chevron-contract" aria-hidden="true" /> Collapse all
            </>
          ) : (
            <>
              <i className="bi bi-chevron-expand" aria-hidden="true" /> Expand all
            </>
          )}
        </button>
        <button className="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
          <i className="fa fa-edit" aria-hidden="true" /> Edit questions
        </button>
      </div>
    );
  }

  const saveButton = (
    <button className="btn btn-sm btn-light mx-1" type="submit" disabled={saveButtonDisabled}>
      <i className="fa fa-save" aria-hidden="true" /> Save and sync
    </button>
  );

  // Strip trackingIds before saving - they are only used for drag-and-drop identity
  const zonesForSave = stripTrackingIds(zones);

  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zonesForSave)} />
      {saveButtonDisabledReason ? (
        <span title={saveButtonDisabledReason} style={{ cursor: 'not-allowed' }}>
          {saveButton}
        </span>
      ) : (
        saveButton
      )}
      <button className="btn btn-sm btn-light" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

interface InstructorAssessmentQuestionsTableInnerProps {
  course: StaffCourse;
  courseInstance: StaffCourseInstance;
  questionRows: StaffAssessmentQuestionRow[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
  assessmentSetName: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
}

/**
 * The full table and form, and handles state management and modals.
 *
 * Renders assessment zones with AssessmentZone.
 */
function InstructorAssessmentQuestionsTableInner({
  course,
  courseInstance,
  questionRows,
  jsonZones,
  urlPrefix,
  assessment,
  assessmentSetName,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
}: InstructorAssessmentQuestionsTableInnerProps) {
  const trpc = useTRPC();
  const initialZones = addTrackingIds(jsonZones);

  // Initially collapse alternative groups with multiple alternatives
  const initialCollapsedGroups = new Set<string>();
  for (const zone of initialZones) {
    for (const question of zone.questions) {
      if ((question.alternatives?.length ?? 0) > 1) {
        initialCollapsedGroups.add(question.trackingId);
      }
    }
  }

  const initialState = {
    zones: initialZones,
    questionMetadata: Object.fromEntries(
      questionRows.map((r) => [questionDisplayName(course, r), r]),
    ),
    collapsedGroups: initialCollapsedGroups,
    collapsedZones: new Set<string>(),
  };

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesRef = useRef(JSON.stringify(initialState.zones));

  const [editMode, setEditMode] = useState(false);
  const resetModal = useModalState<string>(null);
  const editZoneModal = useModalState<EditZoneModalData>(null);

  const courseQuestionsQuery = useQuery({
    ...trpc.courseQuestions.queryOptions(),
    // Fetch course questions on-demand when edit mode is activated
    enabled: editMode,
  });
  const courseQuestions = courseQuestionsQuery.data ?? [];

  const [questionEditState, setQuestionEditState] = useState<QuestionEditState>({
    status: 'idle',
  });

  const showPicker = questionEditState.status === 'picking';
  const showEditModal = questionEditState.status === 'editing';

  const openPickerToChangeQid = (
    currentFormValues: ZoneQuestionBlockForm | QuestionAlternativeForm,
  ) => {
    if (questionEditState.status !== 'editing') return;
    const zoneTrackingId = run(() => {
      if (questionEditState.mode === 'create') {
        return questionEditState.zoneTrackingId;
      }
      return zones.find((z) =>
        z.questions.some((q) => q.trackingId === questionEditState.questionTrackingId),
      )?.trackingId;
    });
    if (!zoneTrackingId) return;
    // Merge current form values into the original question to preserve unsaved
    // edits (e.g. points/manual points) while keeping extra properties that
    // aren't registered as form fields.
    const questionWithFormValues: typeof questionEditState.question = {
      ...questionEditState.question,
      ...currentFormValues,
      trackingId: questionEditState.question.trackingId,
    };
    // Restore inheritance for fields that were not explicitly set on the
    // original question. `getValues()` includes inherited display values,
    // so without this cleanup `isInherited()` would return false after the
    // pick-and-return cycle.
    for (const field of INHERITABLE_FIELDS) {
      if (
        !(field in questionEditState.question) ||
        questionEditState.question[field as keyof typeof questionEditState.question] === undefined
      ) {
        delete questionWithFormValues[field as keyof typeof questionWithFormValues];
      }
    }
    const returnToEdit: EditingState = {
      ...questionEditState,
      question: questionWithFormValues,
    } as EditingState;
    setQuestionEditState({
      status: 'picking',
      zoneTrackingId,
      returnToEdit,
    });
  };

  const openEditForExisting = ({
    question,
    zoneQuestionBlock,
    questionTrackingId,
    alternativeTrackingId,
  }: {
    question: ZoneQuestionBlockForm | QuestionAlternativeForm;
    zoneQuestionBlock?: ZoneQuestionBlockForm;
    questionTrackingId: string;
    alternativeTrackingId?: string;
  }) => {
    setQuestionEditState({
      status: 'editing',
      mode: 'edit',
      questionTrackingId,
      alternativeTrackingId,
      question,
      zoneQuestionBlock,
      originalQuestionId: question.id,
    });
  };

  const handlePickerCancel = () => {
    if (questionEditState.status === 'picking' && questionEditState.returnToEdit) {
      setQuestionEditState(questionEditState.returnToEdit);
    } else {
      setQuestionEditState({ status: 'idle' });
    }
  };

  const questionsInAssessment = useMemo(() => {
    const qids = new Set<string>();
    for (const zone of zones) {
      for (const question of zone.questions) {
        if (question.id) qids.add(question.id);
        if (question.alternatives) {
          for (const alt of question.alternatives) {
            if (alt.id) qids.add(alt.id);
          }
        }
      }
    }
    return qids;
  }, [zones]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const positionByStableId = useMemo(() => {
    const map: Record<string, { zoneIndex: number; questionIndex: number }> = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
      });
    });
    return map;
  }, [zones]);

  const zoneStartNumbers = useMemo(() => {
    const starts: number[] = [];
    let count = 0;
    zones.forEach((zone) => {
      starts.push(count + 1);
      count += zone.questions.length;
    });
    return starts;
  }, [zones]);

  const handleQuestionPicked = (qid: string) => {
    if (questionEditState.status !== 'picking') return;

    if (questionEditState.returnToEdit) {
      // Spread of discriminated union requires assertion to preserve narrowing
      setQuestionEditState({
        ...questionEditState.returnToEdit,
        question: { ...questionEditState.returnToEdit.question, id: qid },
      } as EditingState);
    } else {
      setQuestionEditState({
        status: 'editing',
        mode: 'create',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: { id: qid, trackingId: '' } as ZoneQuestionBlockForm,
        existingQids: [...questionsInAssessment],
      });
    }
  };

  const handleAddAndPickAnother = () => {
    if (questionEditState.status !== 'editing' || questionEditState.mode !== 'create') return;
    setQuestionEditState({ status: 'picking', zoneTrackingId: questionEditState.zoneTrackingId });
  };

  const buildQuestionMetadata = (data: QuestionByQidResult): StaffAssessmentQuestionRow => {
    return StaffAssessmentQuestionRowSchema.parse({
      zone: {
        id: '0',
        assessment_id: assessment.id,
        number: 0,
        title: null,
        max_points: null,
        best_questions: null,
        number_choose: null,
        advance_score_perc: null,
        lockpoint: false,
        json_allow_real_time_grading: null,
        json_can_submit: null,
        json_can_view: null,
        json_comment: null,
        json_grade_rate_minutes: null,
      },
      course_instance: courseInstance,
      course,
      question: data.question,
      topic: data.topic,
      open_issue_count: data.open_issue_count,
      tags: data.tags,
      other_assessments: null,
      assessment,
      assessment_question: {
        id: '0',
        question_id: data.question.id,
        assessment_id: assessment.id,
        ai_grading_mode: false,
        allow_real_time_grading: true,
        alternative_group_id: null,
        advance_score_perc: null,
        average_average_submission_score: null,
        average_first_submission_score: null,
        average_last_submission_score: null,
        average_max_submission_score: null,
        average_number_submissions: null,
        average_submission_score_hist: null,
        average_submission_score_variance: null,
        deleted_at: null,
        discrimination: null,
        effective_advance_score_perc: 0,
        first_submission_score_hist: null,
        first_submission_score_variance: null,
        force_max_points: null,
        grade_rate_minutes: null,
        incremental_submission_points_array_averages: null,
        incremental_submission_points_array_variances: null,
        incremental_submission_score_array_averages: null,
        incremental_submission_score_array_variances: null,
        init_points: null,
        json_allow_real_time_grading: null,
        json_auto_points: null,
        json_comment: null,
        json_force_max_points: null,
        json_grade_rate_minutes: null,
        json_manual_points: null,
        json_max_auto_points: null,
        json_max_points: null,
        json_points: null,
        json_tries_per_variant: null,
        last_submission_score_hist: null,
        last_submission_score_variance: null,
        manual_rubric_id: null,
        max_auto_points: null,
        max_manual_points: null,
        max_points: null,
        max_submission_score_hist: null,
        max_submission_score_variance: null,
        mean_question_score: null,
        median_question_score: null,
        number: 0,
        number_in_alternative_group: null,
        number_submissions_hist: null,
        number_submissions_variance: null,
        points_list: null,
        question_score_variance: null,
        quintile_question_scores: null,
        some_nonzero_submission_perc: null,
        some_perfect_submission_perc: null,
        some_submission_perc: null,
        submission_score_array_averages: null,
        submission_score_array_variances: null,
        tries_per_variant: null,
      },
      alternative_group: {
        id: '0',
        assessment_id: assessment.id,
        number: 0,
        zone_id: '0',
        advance_score_perc: null,
        json_allow_real_time_grading: null,
        json_auto_points: null,
        json_can_submit: null,
        json_can_view: null,
        json_comment: null,
        json_force_max_points: null,
        json_grade_rate_minutes: null,
        json_has_alternatives: null,
        json_manual_points: null,
        json_max_auto_points: null,
        json_max_points: null,
        json_points: null,
        json_tries_per_variant: null,
        number_choose: null,
      },
      start_new_zone: false,
      start_new_alternative_group: true,
      alternative_group_size: 1,
    });
  };

  const handleUpdateQuestion = (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    // This will only be provided if the QID changed
    newQuestionData: QuestionByQidResult | undefined,
  ) => {
    if (!updatedQuestion.id) return;
    if (questionEditState.status !== 'editing') return;

    const normalizedQuestion = normalizeQuestionPoints(updatedQuestion);

    if (questionEditState.mode === 'create') {
      dispatch({
        type: 'ADD_QUESTION',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: {
          ...(normalizedQuestion as ZoneQuestionBlockForm),
          ...createQuestionWithTrackingId(),
        },
        questionData: newQuestionData ? buildQuestionMetadata(newQuestionData) : undefined,
      });
    } else {
      if (newQuestionData) {
        dispatch({
          type: 'UPDATE_QUESTION_METADATA',
          questionId: updatedQuestion.id,
          oldQuestionId: questionEditState.originalQuestionId,
          questionData: buildQuestionMetadata(newQuestionData),
        });
      }

      const questionWithNormalizedPoints = {
        ...normalizedQuestion,
        points: normalizedQuestion.manualPoints != null ? undefined : normalizedQuestion.points,
        maxPoints:
          normalizedQuestion.manualPoints != null ? undefined : normalizedQuestion.maxPoints,
      };

      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId: questionEditState.questionTrackingId,
        question: questionWithNormalizedPoints,
        alternativeTrackingId: questionEditState.alternativeTrackingId,
      });
    }

    setQuestionEditState({ status: 'idle' });
  };

  const handleDeleteQuestion = (
    questionTrackingId: string,
    questionId: string,
    alternativeTrackingId?: string,
  ) => {
    dispatch({
      type: 'DELETE_QUESTION',
      questionTrackingId,
      questionId,
      alternativeTrackingId,
    });
  };

  const handleAddZone = () => {
    editZoneModal.showWithData({ type: 'create' });
  };

  const handleEditZone = (zoneTrackingId: string) => {
    const zone = zones.find((z) => z.trackingId === zoneTrackingId);
    if (!zone) return;
    editZoneModal.showWithData({
      type: 'edit',
      zone,
      zoneTrackingId,
    });
  };

  const handleDeleteZone = (zoneTrackingId: string) => {
    dispatch({
      type: 'DELETE_ZONE',
      zoneTrackingId,
    });
  };

  const handleSaveZone = (zone: Partial<ZoneAssessmentForm>, zoneTrackingId?: string) => {
    if (zoneTrackingId === undefined) {
      dispatch({
        type: 'ADD_ZONE',
        zone: createZoneWithTrackingId({
          ...zone,
          questions: zone.questions ?? [],
        } as Omit<ZoneAssessmentForm, 'trackingId'>),
      });
    } else {
      dispatch({
        type: 'UPDATE_ZONE',
        zoneTrackingId,
        zone,
      });
    }
    editZoneModal.hide();
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeType = active.data.current?.type as 'zone' | 'question' | undefined;

    // Handle zone reordering
    if (activeType === 'zone') {
      const fromZoneIndex = zones.findIndex((z) => z.trackingId === activeIdStr);
      if (fromZoneIndex === -1) return;

      const toZoneIndex = zones.findIndex((z) => z.trackingId === overIdStr);
      if (toZoneIndex === -1 || fromZoneIndex === toZoneIndex) return;

      const isDraggingDown = fromZoneIndex < toZoneIndex;
      let beforeZoneTrackingId: string | null;

      if (isDraggingDown) {
        // When dragging down, insert after the target (use next zone's trackingId or null)
        const nextIndex = toZoneIndex + 1;
        beforeZoneTrackingId = nextIndex < zones.length ? zones[nextIndex].trackingId : null;
      } else {
        // When dragging up, insert before the target
        beforeZoneTrackingId = zones[toZoneIndex].trackingId;
      }

      dispatch({
        type: 'REORDER_ZONE',
        zoneTrackingId: activeIdStr,
        beforeZoneTrackingId,
      });
      return;
    }

    // Within-zone question reordering
    const fromPosition = positionByStableId[activeIdStr];
    const toPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition || !toPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];
    const toZone = zones[toPosition.zoneIndex];

    if (fromZone.trackingId !== toZone.trackingId) return;
    if (fromPosition.questionIndex === toPosition.questionIndex) return;

    // When dragging DOWN, insert AFTER the target (use next question's trackingId or null)
    const isDraggingDown = fromPosition.questionIndex < toPosition.questionIndex;
    const beforeQuestionTrackingId = isDraggingDown
      ? (toZone.questions[toPosition.questionIndex + 1]?.trackingId ?? null)
      : toZone.questions[toPosition.questionIndex].trackingId;

    dispatch({
      type: 'REORDER_QUESTION',
      questionTrackingId: activeIdStr,
      toZoneTrackingId: toZone.trackingId,
      beforeQuestionTrackingId,
    });
  };

  // Move questions between zones during drag for smooth cross-zone reordering animation
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeType = active.data.current?.type as 'zone' | 'question' | undefined;
    if (activeType !== 'question') return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const fromPosition = positionByStableId[activeIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];

    // Empty zone's droppable
    const targetZone = zones.find((z) => `${z.trackingId}-empty-drop` === overIdStr);
    if (targetZone && fromZone.trackingId !== targetZone.trackingId) {
      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId: activeIdStr,
        toZoneTrackingId: targetZone.trackingId,
        beforeQuestionTrackingId: null,
      });
      return;
    }

    // Question in a different zone
    const toPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!toPosition) return;
    const toZone = zones[toPosition.zoneIndex];
    if (fromZone.trackingId !== toZone.trackingId) {
      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId: activeIdStr,
        toZoneTrackingId: toZone.trackingId,
        beforeQuestionTrackingId: toZone.questions[toPosition.questionIndex].trackingId,
      });
    }
  };

  const showAdvanceScorePercCol = Object.values(questionMetadata).some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessment.number}: Questions
          </h1>
          <div className="ms-auto">
            {canEdit && origHash ? (
              <EditModeButtons
                csrfToken={csrfToken}
                origHash={origHash}
                zones={zones}
                editMode={editMode}
                setEditMode={setEditMode}
                saveButtonDisabled={
                  JSON.stringify(zones) === initialZonesRef.current ||
                  zones.some((zone) => zone.questions.length === 0)
                }
                saveButtonDisabledReason={
                  zones.some((zone) => zone.questions.length === 0)
                    ? 'Cannot save: one or more zones have no questions'
                    : undefined
                }
                isAllExpanded={collapsedZones.size === 0 && collapsedGroups.size === 0}
                onToggleExpandCollapse={() => {
                  if (collapsedZones.size === 0 && collapsedGroups.size === 0) {
                    dispatch({ type: 'COLLAPSE_ALL' });
                  } else {
                    dispatch({ type: 'EXPAND_ALL' });
                  }
                }}
                onCancel={() => {
                  dispatch({ type: 'RESET' });
                  setEditMode(false);
                }}
              />
            ) : null}
          </div>
        </div>
        <DndContext
          sensors={sensors}
          // TODO: Explore using pointerWithin instead of closestCenter
          collisionDetection={closestCenter}
          autoScroll={false}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={zones.map((z) => z.trackingId)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="table table-sm table-hover mb-0" aria-label="Assessment questions">
                <thead>
                  <tr>
                    {editMode && (
                      <>
                        <th style={{ width: '1%' }}>
                          <span className="visually-hidden">Drag</span>
                        </th>
                        <th>
                          <span className="visually-hidden">Edit</span>
                        </th>
                        <th>
                          <span className="visually-hidden">Delete</span>
                        </th>
                      </>
                    )}
                    <th>
                      <span className="visually-hidden">Name</span>
                    </th>
                    <th>Topic</th>
                    <th>Tags</th>
                    <th>Auto Points</th>
                    <th>Manual Points</th>
                    {showAdvanceScorePercCol && <th>Advance Score</th>}
                    <th>Mean score</th>
                    <th>Num. Submissions Histogram</th>
                    <th>Other Assessments</th>
                    {!editMode && <th className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone, index) => {
                    return (
                      <AssessmentZone
                        key={zone.trackingId}
                        zone={zone}
                        zoneNumber={index + 1}
                        assessmentState={{
                          questionMetadata,
                          editMode,
                          urlPrefix,
                          hasCoursePermissionPreview,
                          canEdit,
                          showAdvanceScorePercCol,
                          assessmentType: assessment.type,
                        }}
                        handleAddQuestion={(zoneTrackingId) =>
                          setQuestionEditState({ status: 'picking', zoneTrackingId })
                        }
                        handleEditQuestion={openEditForExisting}
                        handleDeleteQuestion={handleDeleteQuestion}
                        handleResetButtonClick={resetModal.showWithData}
                        handleEditZone={handleEditZone}
                        handleDeleteZone={handleDeleteZone}
                        startingQuestionNumber={zoneStartNumbers[index]}
                        collapsedGroups={collapsedGroups}
                        collapsedZones={collapsedZones}
                        dispatch={dispatch}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SortableContext>
        </DndContext>
        {editMode && (
          <div className="card-footer">
            <button className="btn btn-sm btn-primary" type="button" onClick={handleAddZone}>
              <i className="fa fa-plus" aria-hidden="true" /> Add zone
            </button>
          </div>
        )}
      </div>
      {assessment.type === 'Homework' ? (
        <ResetQuestionVariantsModal
          csrfToken={csrfToken}
          assessmentQuestionId={resetModal.data ?? ''}
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      ) : (
        <ExamResetNotSupportedModal
          show={resetModal.show}
          onHide={resetModal.onHide}
          onExited={resetModal.onExited}
        />
      )}
      {editMode && (
        <EditQuestionModal
          show={showEditModal}
          data={run(() => {
            if (questionEditState.status !== 'editing') return null;
            if (questionEditState.mode === 'create') {
              return {
                type: 'create' as const,
                question: questionEditState.question,
                existingQids: questionEditState.existingQids,
              };
            }
            return {
              type: 'edit' as const,
              question: questionEditState.question,
              zoneQuestionBlock: questionEditState.zoneQuestionBlock,
              originalQuestionId: questionEditState.originalQuestionId,
            };
          })}
          assessmentType={assessment.type === 'Homework' ? 'Homework' : 'Exam'}
          handleUpdateQuestion={handleUpdateQuestion}
          onHide={() => setQuestionEditState({ status: 'idle' })}
          onPickQuestion={openPickerToChangeQid}
          onAddAndPickAnother={handleAddAndPickAnother}
        />
      )}
      {editMode && <EditZoneModal {...editZoneModal} handleSaveZone={handleSaveZone} />}
      {editMode && (
        <QuestionPickerModal
          show={showPicker}
          courseQuestions={courseQuestions}
          isLoading={courseQuestionsQuery.isLoading}
          questionsInAssessment={questionsInAssessment}
          courseId={course.id}
          urlPrefix={urlPrefix}
          currentQid={
            questionEditState.status === 'picking'
              ? (questionEditState.returnToEdit?.question.id ?? null)
              : null
          }
          currentAssessmentId={assessment.id}
          onHide={handlePickerCancel}
          onQuestionSelected={handleQuestionPicked}
        />
      )}
    </>
  );
}

interface InstructorAssessmentQuestionsTableProps extends InstructorAssessmentQuestionsTableInnerProps {
  trpcCsrfToken: string;
}

export function InstructorAssessmentQuestionsTable({
  trpcCsrfToken,
  ...innerProps
}: InstructorAssessmentQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => createAssessmentQuestionsTrpcClient(trpcCsrfToken));
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstructorAssessmentQuestionsTableInner {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
