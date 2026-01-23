import {
  DndContext,
  type DragEndEvent,
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
import type {
  QuestionAlternativeForm,
  ZoneAssessmentForm,
  ZoneQuestionForm,
} from '../instructorAssessmentQuestions.shared.js';
import {
  buildHierarchicalAssessment,
  normalizeQuestionPoints,
  questionDisplayName,
} from '../utils/questions.js';
import {
  addTrackingIds,
  createQuestionWithTrackingId,
  createZoneWithTrackingId,
  stripTrackingIds,
  useAssessmentEditor,
} from '../utils/useAssessmentEditor.js';

import { AssessmentZone } from './AssessmentZone.js';
import { EditQuestionModal, type EditQuestionModalData } from './EditQuestionModal.js';
import { EditZoneModal, type EditZoneModalData } from './EditZoneModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

function EditModeButtons({
  csrfToken,
  origHash,
  zones,
  editMode,
  setEditMode,
  saveButtonDisabled,
  saveButtonDisabledReason,
}: {
  csrfToken: string;
  origHash: string;
  zones: ZoneAssessmentForm[];
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
  saveButtonDisabled: boolean;
  saveButtonDisabledReason?: string;
}) {
  if (!editMode) {
    return (
      <button className="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
        <i className="fa fa-edit" aria-hidden="true" /> Edit questions
      </button>
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
      <button
        className="btn btn-sm btn-light"
        type="button"
        onClick={() => window.location.reload()}
      >
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
  assessment: StaffAssessment;
  assessmentSetName: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  csrfToken: string;
  origHash: string;
  editorEnabled: boolean;
}) {
  // Initialize editor state from question rows
  const initialZones = addTrackingIds(buildHierarchicalAssessment(course, questionRows));

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
  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // Discriminated union: only store what's needed for each operation
  // - edit: questionTrackingId (and optionally alternativeTrackingId) - zone is found via findQuestionByTrackingId
  // - create: zoneTrackingId - we need to know which zone to add the question to
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<
    | { type: 'edit'; questionTrackingId: string; alternativeTrackingId?: string }
    | { type: 'create'; zoneTrackingId: string }
    | null
  >(null);
  const editQuestionModal = useModalState<EditQuestionModalData>(null);
  const editZoneModal = useModalState<EditZoneModalData>(null);

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
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

  const assessmentType = assessment.type!;

  const handleEditQuestion = ({
    question,
    alternativeGroup,
    questionTrackingId,
    alternativeTrackingId,
  }: {
    question: ZoneQuestionForm | QuestionAlternativeForm;
    alternativeGroup?: ZoneQuestionForm;
    questionTrackingId: string;
    alternativeTrackingId?: string;
  }) => {
    editQuestionModal.showWithData({
      type: 'edit',
      question,
      alternativeGroup,
    });
    setSelectedQuestionIds({
      type: 'edit',
      questionTrackingId,
      alternativeTrackingId,
    });
  };

  const handleAddQuestion = (zoneTrackingId: string) => {
    editQuestionModal.showWithData({
      type: 'create',
      question: { id: '', trackingId: '' } as ZoneQuestionForm,
      mappedQids: zones.flatMap((zone) => zone.questions.map((q) => q.id ?? '')),
    });
    setSelectedQuestionIds({
      type: 'create',
      zoneTrackingId,
    });
  };

  const handleUpdateQuestion = (
    updatedQuestion: ZoneQuestionForm | QuestionAlternativeForm,
    newQuestionData?: StaffAssessmentQuestionRow,
  ) => {
    if (!updatedQuestion.id) return;
    if (!selectedQuestionIds) return;

    // Normalize point fields
    const normalizedQuestion = normalizeQuestionPoints(updatedQuestion);

    if (selectedQuestionIds.type === 'create') {
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
        zoneTrackingId: selectedQuestionIds.zoneTrackingId,
        question: createQuestionWithTrackingId(normalizedQuestion as ZoneQuestionForm),
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
        points: normalizedQuestion.manualPoints ? undefined : normalizedQuestion.points,
        maxPoints: normalizedQuestion.manualPoints ? undefined : normalizedQuestion.maxPoints,
      };

      dispatch({
        type: 'UPDATE_QUESTION',
        questionTrackingId: selectedQuestionIds.questionTrackingId,
        question: questionWithNormalizedPoints,
        alternativeTrackingId: selectedQuestionIds.alternativeTrackingId,
      });
    }

    editQuestionModal.hide();
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

    // Handle question reordering
    const questionTrackingId = activeIdStr;

    // Look up the active item's position to determine its current zone
    const fromPosition = positionByStableId[activeIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fromPosition) return;

    const fromZone = zones[fromPosition.zoneIndex];

    // Check if dropped on a zone (zone header or empty zone warning)
    const targetZone = zones.find((z) => z.trackingId === overIdStr);
    if (targetZone) {
      if (fromZone.trackingId !== targetZone.trackingId) {
        dispatch({
          type: 'REORDER_QUESTION',
          questionTrackingId,
          toZoneTrackingId: targetZone.trackingId,
          beforeQuestionTrackingId: null, // Append at end
        });
      }
      return;
    }

    // Dropped on another sortable item - look up its position by stable ID
    const toPosition = positionByStableId[overIdStr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!toPosition) return;

    const toZone = zones[toPosition.zoneIndex];

    // Only dispatch if actually moving to a different position
    if (
      fromZone.trackingId !== toZone.trackingId ||
      fromPosition.questionIndex !== toPosition.questionIndex
    ) {
      // When dragging DOWN within the same zone, we need to insert AFTER the target
      // because indices shift after the source is removed. Use the question after
      // the target as beforeQuestionTrackingId, or null to append at end.
      const isDraggingDownInSameZone =
        fromZone.trackingId === toZone.trackingId &&
        fromPosition.questionIndex < toPosition.questionIndex;

      let beforeQuestionTrackingId: string | null;
      if (isDraggingDownInSameZone) {
        // Insert after the target: use the next question, or null if at end
        const nextIndex = toPosition.questionIndex + 1;
        beforeQuestionTrackingId =
          nextIndex < toZone.questions.length ? toZone.questions[nextIndex].trackingId : null;
      } else {
        // Insert before the target
        beforeQuestionTrackingId = toZone.questions[toPosition.questionIndex].trackingId;
      }

      dispatch({
        type: 'REORDER_QUESTION',
        questionTrackingId,
        toZoneTrackingId: toZone.trackingId,
        beforeQuestionTrackingId,
      });
    }
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = questionRows.some(
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
              />
            ) : null}
          </div>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          autoScroll={false}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={zones.map((z) => z.trackingId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="table-responsive">
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
                    <th>QID</th>
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
                        AssessmentState={{
                          questionMetadata,
                          editMode,
                          urlPrefix,
                          hasCoursePermissionPreview,
                          canEdit,
                          showAdvanceScorePercCol,
                          assessmentType,
                        }}
                        handleAddQuestion={handleAddQuestion}
                        handleEditQuestion={handleEditQuestion}
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
          assessmentQuestionId={resetAssessmentQuestionId}
          show={showResetModal}
          onHide={() => setShowResetModal(false)}
        />
      ) : (
        <ExamResetNotSupportedModal show={showResetModal} onHide={() => setShowResetModal(false)} />
      )}
      {editMode && (
        <EditQuestionModal
          {...editQuestionModal}
          assessmentType={assessmentType === 'Homework' ? 'Homework' : 'Exam'}
          handleUpdateQuestion={handleUpdateQuestion}
        />
      )}
      {editMode && <EditZoneModal {...editZoneModal} handleSaveZone={handleSaveZone} />}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
