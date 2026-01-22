import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMemo, useRef, useState } from 'react';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { StaffAssessment, StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/infoAssessment.js';
import { useAssessmentEditor } from '../hooks/useAssessmentEditor.js';

import { EditQuestionModal, type EditQuestionModalState } from './EditQuestionModal.js';
import { EditZoneModal, type EditZoneModalState } from './EditZoneModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
import { Zone } from './Zone.js';

export interface AssessmentState {
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  canEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
}

/**
 * Gets a stable ID for a question/alternative group that doesn't change when moved.
 * Uses the question's actual id, or first alternative's id for alt groups.
 */
export function getStableQuestionId(question: ZoneQuestionJson, fallbackIndex: number): string {
  return question.id ?? question.alternatives?.[0]?.id ?? `temp-${fallbackIndex}`;
}

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
  zones: ZoneAssessmentJson[];
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

  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
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

function questionDisplayName(course: StaffCourse, question: StaffAssessmentQuestionRow) {
  if (!question.question.qid) throw new Error('Question QID is required');
  if (course.id === question.question.course_id) {
    return question.question.qid;
  }
  return `@${question.course.sharing_name}/${question.question.qid}`;
}

function mapQuestions(
  course: StaffCourse,
  rows: StaffAssessmentQuestionRow[],
): ZoneAssessmentJson[] {
  const zones: ZoneAssessmentJson[] = [];
  const zoneAlternativeGroupCounts: Record<number, number> = {};

  for (const row of rows) {
    if (row.zone.number == null) throw new Error('Zone number required');

    zones[row.zone.number - 1] ??= {
      title: row.zone.title ?? undefined,
      comment: row.zone.json_comment ?? undefined,
      maxPoints: row.zone.max_points ?? undefined,
      numberChoose: row.zone.number_choose ?? undefined,
      bestQuestions: row.zone.best_questions ?? undefined,
      questions: [],
      advanceScorePerc: row.zone.advance_score_perc ?? undefined,
      gradeRateMinutes: row.zone.json_grade_rate_minutes ?? undefined,
      canView: row.zone.json_can_view ?? [],
      canSubmit: row.zone.json_can_submit ?? [],
    };

    if (row.alternative_group.number == null) throw new Error('Alternative group number required');

    const zoneNumber = row.zone.number;
    zoneAlternativeGroupCounts[zoneNumber] ??= -1;

    // If this is a new alternative group in this zone, increment the count
    if (row.start_new_alternative_group) {
      zoneAlternativeGroupCounts[zoneNumber]++;
    }

    // Use the count as the position within the zone
    const positionInZone = zoneAlternativeGroupCounts[zoneNumber];
    if (!zones[zoneNumber - 1].questions[positionInZone]) {
      zones[zoneNumber - 1].questions[positionInZone] ??= {
        id: row.alternative_group.id ? questionDisplayName(course, row) : undefined,
        comment: row.alternative_group.json_comment ?? undefined,
        advanceScorePerc: row.alternative_group.advance_score_perc ?? undefined,
        canView: row.alternative_group.json_can_view ?? [],
        canSubmit: row.alternative_group.json_can_submit ?? [],
        gradeRateMinutes: row.alternative_group.json_grade_rate_minutes ?? undefined,
        numberChoose: row.alternative_group.number_choose ?? 1,
        triesPerVariant: row.alternative_group.json_tries_per_variant ?? 1,
        points: row.alternative_group.json_points ?? undefined,
        autoPoints: row.alternative_group.json_auto_points ?? undefined,
        maxPoints: row.alternative_group.json_max_points ?? undefined,
        maxAutoPoints: row.alternative_group.json_max_auto_points ?? undefined,
        manualPoints: row.alternative_group.json_manual_points ?? undefined,
        forceMaxPoints: row.alternative_group.json_force_max_points ?? undefined,
      };
    }

    if (row.alternative_group.json_has_alternatives) {
      if (row.assessment_question.number_in_alternative_group == null) {
        throw new Error('Assessment question number is required');
      }

      zones[zoneNumber - 1].questions[positionInZone].alternatives ??= [];
      zones[zoneNumber - 1].questions[positionInZone].alternatives![
        row.assessment_question.number_in_alternative_group - 1
      ] = {
        comment: row.assessment_question.json_comment ?? undefined,
        id: questionDisplayName(course, row),
        forceMaxPoints: row.assessment_question.json_force_max_points ?? undefined,
        triesPerVariant: row.assessment_question.json_tries_per_variant ?? undefined,
        advanceScorePerc: row.assessment_question.advance_score_perc ?? undefined,
        gradeRateMinutes: row.assessment_question.grade_rate_minutes ?? undefined,
        allowRealTimeGrading: row.assessment_question.json_allow_real_time_grading ?? undefined,
        points: row.assessment_question.json_points ?? undefined,
        autoPoints: row.assessment_question.json_auto_points ?? undefined,
        maxPoints: row.assessment_question.json_max_points ?? undefined,
        maxAutoPoints: row.assessment_question.json_max_auto_points ?? undefined,
        manualPoints: row.assessment_question.json_manual_points ?? undefined,
      };
    } else {
      zones[zoneNumber - 1].questions[positionInZone].id = questionDisplayName(course, row);
    }
  }
  return zones;
}

/**
 * Normalizes point fields based on whether manualPoints is set.
 * When manualPoints is defined or both points/autoPoints exist, we convert
 * to autoPoints/maxAutoPoints format (clearing points/maxPoints).
 */
function normalizeQuestionPoints(
  question: ZoneQuestionJson | QuestionAlternativeJson,
): ZoneQuestionJson | QuestionAlternativeJson {
  const normalized = { ...question };

  const hasManualPoints = normalized.manualPoints !== undefined;
  const hasBothPointTypes = normalized.points !== undefined && normalized.autoPoints !== undefined;

  if (hasManualPoints || hasBothPointTypes) {
    // Convert points to autoPoints if needed
    if (normalized.points !== undefined) {
      normalized.autoPoints = normalized.points;
      normalized.points = undefined;
    }
    // Convert maxPoints to maxAutoPoints if needed
    if (normalized.maxPoints !== undefined) {
      normalized.maxAutoPoints = normalized.maxPoints;
      normalized.maxPoints = undefined;
    }
  }

  return normalized;
}

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
  const initialState = {
    zones: mapQuestions(course, questionRows),
    questionMap: Object.fromEntries(questionRows.map((r) => [questionDisplayName(course, r), r])),
  };

  const { zones, questionMap, dispatch } = useAssessmentEditor(initialState);
  const initialZonesRef = useRef(JSON.stringify(initialState.zones));

  // UI-only state
  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedQuestionPosition, setSelectedQuestionPosition] = useState<{
    zoneIndex: number;
    questionIndex: number;
    alternativeIndex?: number;
  } | null>(null);
  const [editQuestionModalState, setEditQuestionModalState] = useState<EditQuestionModalState>({
    type: 'closed',
  });
  const [editZoneModalState, setEditZoneModalState] = useState<EditZoneModalState>({
    type: 'closed',
  });

  // dnd-kit sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Track the active dragging item
  const [activeId, setActiveId] = useState<string | null>(null);

  // Create sortable IDs per zone using stable question IDs (not positional)
  const sortableIdsByZone = useMemo(() => {
    let globalIndex = 0;
    return zones.map((zone) =>
      zone.questions.map((question) => getStableQuestionId(question, globalIndex++)),
    );
  }, [zones]);

  // Map from stable question ID to its current position {zoneIndex, questionIndex}
  // This is recomputed when zones change and used by drag handlers
  const positionByStableId = useMemo(() => {
    const map: Record<string, { zoneIndex: number; questionIndex: number }> = {};
    let globalIndex = 0;
    zones.forEach((zone, zoneIndex) => {
      zone.questions.forEach((question, questionIndex) => {
        const stableId = getStableQuestionId(question, globalIndex++);
        map[stableId] = { zoneIndex, questionIndex };
      });
    });
    return map;
  }, [zones]);

  // Pre-calculate all question numbers as a map: stableId -> questionNumber
  // This ensures numbers are stable regardless of render order or drag state
  const questionNumberMap = useMemo(() => {
    const map: Record<string, number> = {};
    let questionNumber = 1;
    let globalIndex = 0;
    zones.forEach((zone) => {
      zone.questions.forEach((question) => {
        const stableId = getStableQuestionId(question, globalIndex++);
        map[stableId] = questionNumber;
        questionNumber++;
      });
    });
    return map;
  }, [zones]);

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

  const assessmentType = assessment.type!;

  const handleEditQuestion = ({
    question,
    alternativeGroup,
    zoneNumber,
    alternativeGroupNumber,
    alternativeNumber,
  }: {
    question: ZoneQuestionJson | QuestionAlternativeJson;
    alternativeGroup?: ZoneQuestionJson;
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
  }) => {
    setEditQuestionModalState({
      type: 'edit',
      question,
      alternativeGroup,
    });
    setSelectedQuestionPosition({
      zoneIndex: zoneNumber - 1,
      questionIndex: alternativeGroupNumber - 1,
      alternativeIndex: alternativeNumber,
    });
  };

  const handleAddQuestion = (zoneNumber: number) => {
    setEditQuestionModalState({
      type: 'create',
      question: { id: '' } as ZoneQuestionJson,
      mappedQids: zones.flatMap((zone) => zone.questions.map((q) => q.id ?? '')),
    });
    setSelectedQuestionPosition({
      zoneIndex: zoneNumber - 1,
      questionIndex: zones[zoneNumber - 1].questions.length,
    });
  };

  const handleUpdateQuestion = (
    updatedQuestion: ZoneQuestionJson | QuestionAlternativeJson,
    newQuestionData?: StaffAssessmentQuestionRow,
  ) => {
    if (!updatedQuestion.id) return;
    if (!selectedQuestionPosition) return;
    if (editQuestionModalState.type === 'closed') return;

    const { zoneIndex, questionIndex, alternativeIndex } = selectedQuestionPosition;

    // Normalize point fields
    const normalizedQuestion = normalizeQuestionPoints(updatedQuestion);

    if (editQuestionModalState.type === 'create') {
      // Prepare question data for the map if provided
      let preparedQuestionData: StaffAssessmentQuestionRow | undefined;
      if (newQuestionData) {
        preparedQuestionData = {
          ...newQuestionData,
          assessment,
          assessment_question: {
            ...newQuestionData.assessment_question,
            number: questionIndex + 1,
            number_in_alternative_group: null,
          } as StaffAssessmentQuestionRow['assessment_question'],
          alternative_group: {
            ...newQuestionData.alternative_group,
            number: questionIndex + 1,
          },
          alternative_group_size: 1,
        };
      }

      dispatch({
        type: 'ADD_QUESTION',
        zoneIndex,
        question: normalizedQuestion as ZoneQuestionJson,
        questionData: preparedQuestionData,
      });
    } else {
      // Update existing question
      if (newQuestionData) {
        dispatch({
          type: 'UPDATE_QUESTION_MAP',
          questionId: updatedQuestion.id,
          questionData: {
            ...newQuestionData,
            assessment,
            assessment_question: {
              ...newQuestionData.assessment_question,
              number: questionIndex + 1,
              number_in_alternative_group:
                alternativeIndex !== undefined ? alternativeIndex + 1 : null,
            } as StaffAssessmentQuestionRow['assessment_question'],
            alternative_group: {
              ...newQuestionData.alternative_group,
              number: questionIndex + 1,
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
        zoneIndex,
        questionIndex,
        question: questionWithNormalizedPoints,
        alternativeIndex,
      });
    }

    setEditQuestionModalState({ type: 'closed' });
  };

  const handleDeleteQuestion = (
    zoneNumber: number,
    alternativeGroupNumber: number,
    questionId: string,
    numberInAlternativeGroup?: number,
  ) => {
    dispatch({
      type: 'DELETE_QUESTION',
      zoneIndex: zoneNumber - 1,
      questionIndex: alternativeGroupNumber - 1,
      questionId,
      alternativeIndex: numberInAlternativeGroup,
    });
  };

  const handleAddZone = () => {
    setEditZoneModalState({ type: 'create' });
  };

  const handleEditZone = (zoneNumber: number) => {
    const zone = zones[zoneNumber - 1];
    setEditZoneModalState({
      type: 'edit',
      zone,
      zoneIndex: zoneNumber - 1,
    });
  };

  const handleDeleteZone = (zoneNumber: number) => {
    dispatch({
      type: 'DELETE_ZONE',
      zoneIndex: zoneNumber - 1,
    });
  };

  const handleSaveZone = (zone: Partial<ZoneAssessmentJson>, zoneIndex?: number) => {
    if (zoneIndex === undefined) {
      // Adding a new zone
      dispatch({
        type: 'ADD_ZONE',
        zone: {
          ...zone,
          questions: zone.questions ?? [],
        } as ZoneAssessmentJson,
      });
    } else {
      // Updating an existing zone
      dispatch({
        type: 'UPDATE_ZONE',
        zoneIndex,
        zone,
      });
    }
    setEditZoneModalState({ type: 'closed' });
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Look up the active item's current position by its stable ID
    const fromPosition = positionByStableId[activeIdStr];
    if (!fromPosition) return;

    const { zoneIndex: fromZoneIndex, questionIndex: fromQuestionIndex } = fromPosition;

    // Check if dragging over a zone droppable (e.g., "zone-0-droppable")
    const droppableMatch = overIdStr.match(/^zone-(\d+)-droppable$/);
    if (droppableMatch) {
      const targetZoneIndex = Number.parseInt(droppableMatch[1]);
      if (fromZoneIndex !== targetZoneIndex) {
        dispatch({
          type: 'REORDER_QUESTION',
          fromZoneIndex,
          fromQuestionIndex,
          toZoneIndex: targetZoneIndex,
          toQuestionIndex: zones[targetZoneIndex].questions.length,
        });
      }
      return;
    }

    // Dragging over another sortable item - look up its position by stable ID
    const toPosition = positionByStableId[overIdStr];
    if (!toPosition) return;

    const { zoneIndex: toZoneIndex, questionIndex: toQuestionIndex } = toPosition;

    if (fromZoneIndex !== toZoneIndex || fromQuestionIndex !== toQuestionIndex) {
      dispatch({
        type: 'REORDER_QUESTION',
        fromZoneIndex,
        fromQuestionIndex,
        toZoneIndex,
        toQuestionIndex,
      });
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);

    // All reordering happens in handleDragOver, so we just need to clean up here
    if (!over || active.id === over.id) return;
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = questionRows.some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );
  const baseCols = showAdvanceScorePercCol ? 11 : 10;
  const nTableCols = baseCols + (editMode ? 3 : 0);

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
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
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
                    <Zone
                      key={`zone-${index + 1}-${zone.title || 'untitled'}`}
                      zone={zone}
                      zoneNumber={index + 1}
                      AssessmentState={{
                        nTableCols,
                        questionMap,
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
                      questionNumberMap={questionNumberMap}
                      sortableIds={sortableIdsByZone[index]}
                      activeId={activeId}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
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
      {editMode && editQuestionModalState.type !== 'closed' ? (
        <EditQuestionModal
          editQuestionModalState={editQuestionModalState}
          assessmentType={assessmentType === 'Homework' ? 'Homework' : 'Exam'}
          handleUpdateQuestion={handleUpdateQuestion}
          onHide={() => setEditQuestionModalState({ type: 'closed' })}
        />
      ) : null}
      {editMode && editZoneModalState.type !== 'closed' ? (
        <EditZoneModal
          editZoneModalState={editZoneModalState}
          handleSaveZone={handleSaveZone}
          onHide={() => setEditZoneModalState({ type: 'closed' })}
        />
      ) : null}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
