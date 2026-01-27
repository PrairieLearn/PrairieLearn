import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useMemo, useRef, useState } from 'react';

import { useModalState } from '@prairielearn/ui';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { StaffAssessment, StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../instructorAssessmentQuestions.shared.js';
import type { CourseQuestionForPicker } from '../types.js';
import { normalizeQuestionPoints, questionDisplayName } from '../utils/questions.js';
import {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
  useAssessmentEditor,
} from '../utils/useAssessmentEditor.js';

import { AssessmentZone } from './AssessmentZone.js';
import { EditQuestionModal } from './EditQuestionModal.js';
import { EditZoneModal, type EditZoneModalData } from './EditZoneModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { QuestionPickerModal } from './QuestionPickerModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

/**
 * Consolidated state for the question picker and edit modal flow.
 * This replaces the previously scattered state pieces (selectedQuestionIds,
 * editQuestionModal, questionPickerModal, pickerContext).
 */
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

/**
 * The full table and form, and handles state management and modals.
 *
 * Renders assessment zones with AssessmentZone.
 */
export function InstructorAssessmentQuestionsTable({
  course,
  questionRows,
  courseQuestions,
  jsonZones,
  urlPrefix,
  assessment,
  assessmentSetName,
  hasCoursePermissionPreview,
  canEdit,
  csrfToken,
  origHash,
  editorEnabled,
}: {
  course: StaffCourse;
  questionRows: StaffAssessmentQuestionRow[];
  courseQuestions: CourseQuestionForPicker[];
  jsonZones: ZoneAssessmentJson[];
  assessment: StaffAssessment;
  assessmentSetName: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  editorEnabled: boolean;
}) {
  // Initialize editor state from JSON zones
  const initialZones = addTrackingIds(jsonZones);

  // Initially collapse alternative groups with multiple alternatives (not in edit mode)
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
    collapsedZones: new Set<string>(), // Zones start expanded
  };

  const { zones, questionMetadata, collapsedGroups, collapsedZones, dispatch } =
    useAssessmentEditor(initialState);
  const initialZonesRef = useRef(JSON.stringify(initialState.zones));

  // UI-only state
  const [editMode, setEditMode] = useState(false);
  const resetModal = useModalState<string>(null);
  const editZoneModal = useModalState<EditZoneModalData>(null);

  // Consolidated state for question picker and edit modal flow
  const [questionEditState, setQuestionEditState] = useState<QuestionEditState>({
    status: 'idle',
  });

  // Derived modal visibility
  const showPicker = questionEditState.status === 'picking';
  const showEditModal = questionEditState.status === 'editing';

  // Helper functions for state transitions
  const openPickerForNew = (zoneTrackingId: string) => {
    setQuestionEditState({ status: 'picking', zoneTrackingId });
  };

  const openPickerToChangeQid = () => {
    if (questionEditState.status !== 'editing') return;
    const zoneTrackingId =
      questionEditState.mode === 'create'
        ? questionEditState.zoneTrackingId
        : (zones.find((z) =>
            z.questions.some((q) => q.trackingId === questionEditState.questionTrackingId),
          )?.trackingId ?? '');
    setQuestionEditState({
      status: 'picking',
      zoneTrackingId,
      returnToEdit: questionEditState,
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
    });
  };

  const closeQuestionEditState = () => {
    setQuestionEditState({ status: 'idle' });
  };

  const handlePickerCancel = () => {
    if (questionEditState.status === 'picking' && questionEditState.returnToEdit) {
      // Return to the edit modal without changing the QID
      setQuestionEditState(questionEditState.returnToEdit);
    } else {
      closeQuestionEditState();
    }
  };

  // Questions already in the assessment are those with metadata
  const questionsInAssessment = useMemo(
    () => new Set(Object.keys(questionMetadata)),
    [questionMetadata],
  );

  // dnd-kit sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Map from trackingId to its current position {zoneIndex, questionIndex}
  // This is recomputed when zones change and used by drag handlers
  const positionByStableId = useMemo(() => {
    const map: Record<string, { zoneIndex: number; questionIndex: number }> = {};
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        map[question.trackingId] = { zoneIndex, questionIndex };
      });
    });
    return map;
  }, [zones]);

  // Pre-calculate the starting question number for each zone
  const zoneStartNumbers = useMemo(() => {
    const starts: number[] = [];
    let count = 0;
    zones.forEach((zone) => {
      starts.push(count + 1);
      count += zone.questions.length;
    });
    return starts;
  }, [zones]);

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    resetModal.showWithData(assessmentQuestionId);
  };

  const assessmentType = assessment.type!;

  const handleAddQuestion = (zoneTrackingId: string) => {
    openPickerForNew(zoneTrackingId);
  };

  const handleQuestionPicked = (qid: string) => {
    if (questionEditState.status !== 'picking') return;

    if (questionEditState.returnToEdit) {
      // Return to edit modal with new QID while preserving other form values
      const returnState = questionEditState.returnToEdit;
      // Type discrimination needed for TypeScript to narrow the union type
      if (returnState.mode === 'create') {
        setQuestionEditState({
          ...returnState,
          question: { ...returnState.question, id: qid },
        });
      } else {
        setQuestionEditState({
          ...returnState,
          question: { ...returnState.question, id: qid },
        });
      }
    } else {
      // Open edit modal for new question
      setQuestionEditState({
        status: 'editing',
        mode: 'create',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: { id: qid, trackingId: '' } as ZoneQuestionBlockForm,
        existingQids: Object.keys(questionMetadata),
      });
    }
  };

  // Handler for "Add & pick another" button - adds question and reopens picker for same zone
  const handleAddAndPickAnother = () => {
    if (questionEditState.status !== 'editing' || questionEditState.mode !== 'create') return;
    const zoneTrackingId = questionEditState.zoneTrackingId;
    // Will transition to picker after handleUpdateQuestion processes the save
    setQuestionEditState({ status: 'picking', zoneTrackingId });
  };

  const handleUpdateQuestion = (
    updatedQuestion: ZoneQuestionBlockForm | QuestionAlternativeForm,
    newQuestionData?: StaffAssessmentQuestionRow,
  ) => {
    if (!updatedQuestion.id) return;
    if (questionEditState.status !== 'editing') return;

    // Normalize point fields
    const normalizedQuestion = normalizeQuestionPoints(updatedQuestion);

    if (questionEditState.mode === 'create') {
      // Prepare question data for the map if provided
      let preparedQuestionData: StaffAssessmentQuestionRow | undefined;
      if (newQuestionData) {
        preparedQuestionData = {
          ...newQuestionData,
          assessment,
          assessment_question: {
            ...newQuestionData.assessment_question,
            number: 0, // Will be recalculated on save
            number_in_alternative_group: null,
          } as StaffAssessmentQuestionRow['assessment_question'],
          alternative_group: {
            ...newQuestionData.alternative_group,
            number: 0, // Will be recalculated on save
          },
          alternative_group_size: 1,
        };
      }

      dispatch({
        type: 'ADD_QUESTION',
        zoneTrackingId: questionEditState.zoneTrackingId,
        question: createQuestionWithTrackingId(normalizedQuestion as ZoneQuestionBlockForm),
        questionData: preparedQuestionData,
      });
    } else {
      // Update existing question
      if (newQuestionData) {
        dispatch({
          type: 'UPDATE_QUESTION_METADATA',
          questionId: updatedQuestion.id,
          questionData: {
            ...newQuestionData,
            assessment,
            assessment_question: {
              ...newQuestionData.assessment_question,
              number: 0, // Will be recalculated on save
              number_in_alternative_group: null,
            } as StaffAssessmentQuestionRow['assessment_question'],
            alternative_group: {
              ...newQuestionData.alternative_group,
              number: 0, // Will be recalculated on save
            },
            alternative_group_size: 1,
          },
        });
      }

      // Apply point normalization for the update
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

    closeQuestionEditState();
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
      // Adding a new zone
      dispatch({
        type: 'ADD_ZONE',
        zone: createZoneWithTrackingId({
          ...zone,
          questions: zone.questions ?? [],
        } as Omit<ZoneAssessmentForm, 'trackingId'>),
      });
    } else {
      // Updating an existing zone
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

      // Find the target zone index
      const toZoneIndex = zones.findIndex((z) => z.trackingId === overIdStr);
      if (toZoneIndex === -1 || fromZoneIndex === toZoneIndex) return;

      // Determine insertion point based on drag direction
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

  // If at least one question has a nonzero unlock score, display the Advance Score column
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
            {editorEnabled && canEdit && origHash ? (
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
          collisionDetection={pointerWithin}
          autoScroll={false}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={zones.map((z) => z.trackingId)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ overflowX: 'auto' }}>
              <table className="table table-sm table-hover" aria-label="Assessment questions">
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
                          assessmentType,
                        }}
                        handleAddQuestion={handleAddQuestion}
                        handleEditQuestion={openEditForExisting}
                        handleDeleteQuestion={handleDeleteQuestion}
                        handleResetButtonClick={handleResetButtonClick}
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
      {assessmentType === 'Homework' ? (
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
          data={
            questionEditState.status === 'editing'
              ? questionEditState.mode === 'create'
                ? {
                    type: 'create' as const,
                    question: questionEditState.question,
                    existingQids: questionEditState.existingQids,
                  }
                : {
                    type: 'edit' as const,
                    question: questionEditState.question,
                    zoneQuestionBlock: questionEditState.zoneQuestionBlock,
                  }
              : null
          }
          assessmentType={assessmentType === 'Homework' ? 'Homework' : 'Exam'}
          handleUpdateQuestion={handleUpdateQuestion}
          onHide={closeQuestionEditState}
          onPickQuestion={openPickerToChangeQid}
          onAddAndPickAnother={handleAddAndPickAnother}
        />
      )}
      {editMode && <EditZoneModal {...editZoneModal} handleSaveZone={handleSaveZone} />}
      {editMode && (
        <QuestionPickerModal
          show={showPicker}
          courseQuestions={courseQuestions}
          questionsInAssessment={questionsInAssessment}
          currentQid={
            questionEditState.status === 'picking'
              ? (questionEditState.returnToEdit?.question.id ?? null)
              : null
          }
          onHide={handlePickerCancel}
          onQuestionSelected={handleQuestionPicked}
        />
      )}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
