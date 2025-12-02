import { useState } from 'preact/hooks';

import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { StaffAssessment, StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/infoAssessment.js';

import { EditQuestionModal, type EditQuestionModalState } from './EditQuestionModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';
import { Zone } from './Zone.js';

function EditModeButtons({
  csrfToken,
  origHash,
  zones,
  editMode,
  setEditMode,
}: {
  csrfToken: string;
  origHash: string;
  zones: ZoneAssessmentJson[];
  editMode: boolean;
  setEditMode: (editMode: boolean) => void;
}) {
  if (!editMode) {
    return (
      <button class="btn btn-sm btn-light" type="button" onClick={() => setEditMode(true)}>
        <i class="fa fa-edit" aria-hidden="true" /> Edit questions
      </button>
    );
  }

  return (
    <form method="POST">
      <input type="hidden" name="__action" value="save_questions" />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="orig_hash" value={origHash} />
      <input type="hidden" name="zones" value={JSON.stringify(zones)} />
      <button class="btn btn-sm btn-light mx-1" type="submit">
        <i class="fa fa-save" aria-hidden="true" /> Save and sync
      </button>
      <button class="btn btn-sm btn-light" type="button" onClick={() => window.location.reload()}>
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
  return `@${question.course.sharing_name}/${question.question.qid || ''}`;
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
  const [questionMap, setQuestionMap] = useState(() =>
    Object.fromEntries(questionRows.map((r) => [questionDisplayName(course, r), r])),
  );

  const [mappedQuestions, setMappedQuestions] = useState(() => mapQuestions(course, questionRows));

  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedQuestionPosition, setSelectedQuestionPosition] = useState<{
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
  } | null>(null);
  const [editQuestionModalState, setEditQuestionModalState] = useState<EditQuestionModalState>({
    type: 'closed',
  });
  const [qidValidationError, setQidValidationError] = useState<string>('');
  let questionNumber = 0;
  const getNextQuestionNumber = () => {
    questionNumber++;
    return questionNumber;
  };

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

  if (!assessment.type) {
    throw new Error('Assessment type is required');
  }
  const assessmentType: EnumAssessmentType = assessment.type;

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
      zoneNumber,
      alternativeGroupNumber,
      alternativeNumber: alternativeNumber ?? undefined,
    });
    setQidValidationError(''); // Clear any previous validation errors
  };

  const handleAddQuestion = (zoneNumber: number) => {
    setEditQuestionModalState({
      type: 'create',
      question: { id: '' } as ZoneQuestionJson,
    });
    setSelectedQuestionPosition({
      zoneNumber,
      alternativeGroupNumber: mappedQuestions[zoneNumber - 1].questions.length + 1,
    });
    setQidValidationError(''); // Clear any previous validation errors
  };

  const handleUpdateQuestion = async (
    updatedQuestion: ZoneQuestionJson | QuestionAlternativeJson,
  ) => {
    if (!updatedQuestion.id) return;
    if (!selectedQuestionPosition) return;
    if (editQuestionModalState.type === 'closed') return;

    // Check if QID already exists in the assessment
    const isOriginalQid =
      editQuestionModalState.type === 'edit' &&
      updatedQuestion.id === editQuestionModalState.question.id;
    const isDuplicateQid =
      !isOriginalQid &&
      mappedQuestions.some((zone) =>
        zone.questions.some((q) => {
          if (q.id === updatedQuestion.id) return true;
          return q.alternatives?.some((alt) => alt.id === updatedQuestion.id) ?? false;
        }),
      );

    if (isDuplicateQid) {
      setQidValidationError('QID already exists in this assessment');
      return;
    }

    let questionData: StaffAssessmentQuestionRow | null = null;
    if (updatedQuestion.id !== editQuestionModalState.question.id) {
      const params = new URLSearchParams({ qid: updatedQuestion.id });
      const res = await fetch(`${window.location.pathname}/question.json?${params.toString()}`, {
        method: 'GET',
      });
      if (!res.ok) {
        throw new Error('Failed to save question');
      }
      questionData = await res.json();
      // Check if the question data is null (invalid QID)
      if (questionData === null) {
        setQidValidationError('Invalid QID');
        return;
      }
      // Update the question data with the new assessment and position info
      questionData.assessment = assessment;
      questionData.assessment_question = {
        ...questionData.assessment_question,
        number: selectedQuestionPosition.alternativeGroupNumber,
        number_in_alternative_group: selectedQuestionPosition.alternativeNumber ?? null,
      } as StaffAssessmentQuestionRow['assessment_question'];
      questionData.alternative_group = {
        ...questionData.alternative_group,
        number: selectedQuestionPosition.alternativeGroupNumber,
      } as StaffAssessmentQuestionRow['alternative_group'];
      questionData.alternative_group_size = 1;
      setQuestionMap((prev) => ({
        ...prev,
        [updatedQuestion.id!]: questionData!,
      }));
    }
    setQidValidationError('');

    if (updatedQuestion.manualPoints !== undefined) {
      // If we have manualPoints, we must use autoPoints (not points)
      if (updatedQuestion.points !== undefined) {
        updatedQuestion.autoPoints = updatedQuestion.points;
        delete updatedQuestion.points;
      }
      // Also convert maxPoints to maxAutoPoints
      if (updatedQuestion.maxPoints !== undefined) {
        updatedQuestion.maxAutoPoints = updatedQuestion.maxPoints;
        delete updatedQuestion.maxPoints;
      }
    } else {
      if (updatedQuestion.points !== undefined && updatedQuestion.autoPoints !== undefined) {
        delete updatedQuestion.points;
        if (updatedQuestion.maxPoints !== undefined) {
          updatedQuestion.maxAutoPoints = updatedQuestion.maxPoints;
          delete updatedQuestion.maxPoints;
        }
      }
    }

    const { zoneNumber, alternativeGroupNumber, alternativeNumber } = selectedQuestionPosition;

    setMappedQuestions((prevZones) => {
      const newZones = structuredClone(prevZones);
      const zone = newZones[zoneNumber - 1];

      if (editQuestionModalState.type === 'create') {
        zone.questions.push({
          ...updatedQuestion,
          canSubmit: [],
          canView: [],
        });
        return newZones;
      }

      const question = zone.questions[alternativeGroupNumber - 1];

      if (alternativeNumber !== undefined) {
        if (!question.alternatives) return prevZones;
        question.alternatives[alternativeNumber] = {
          ...question.alternatives[alternativeNumber],
          ...updatedQuestion,
        };
      } else {
        zone.questions[alternativeGroupNumber - 1] = {
          ...question,
          ...updatedQuestion,
        };
      }

      return newZones;
    });

    setEditQuestionModalState({ type: 'closed' });
  };

  const handleDeleteQuestion = (
    zoneNumber: number,
    alternativeGroupNumber: number,
    questionId: string,
    numberInAlternativeGroup?: number,
  ) => {
    setQuestionMap((prev) => {
      const newMap = { ...prev };
      delete newMap[questionId];
      return newMap;
    });
    setMappedQuestions((prevZones) => {
      const newZones = structuredClone(prevZones);
      const zone = newZones[zoneNumber - 1];
      if (numberInAlternativeGroup !== undefined) {
        const alternativeGroup = zone.questions[alternativeGroupNumber - 1];
        alternativeGroup.alternatives?.splice(numberInAlternativeGroup, 1);

        // If only one alternative remains, convert it back to a regular question
        if (alternativeGroup.alternatives?.length === 1) {
          const remainingAlternative = alternativeGroup.alternatives[0];
          // Merge the remaining alternative's properties into the question
          zone.questions[alternativeGroupNumber - 1] = {
            ...alternativeGroup,
            ...remainingAlternative,
            alternatives: undefined,
          };
        }
      } else {
        zone.questions.splice(alternativeGroupNumber - 1, 1);

        // If the zone now has no questions, remove the zone entirely
        // (zones are required to have at least one question per schema)
        if (zone.questions.length === 0) {
          newZones.splice(zoneNumber - 1, 1);
        }
      }
      return newZones;
    });
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = questionRows.some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );
  const baseCols = showAdvanceScorePercCol ? 11 : 10;
  const nTableCols = baseCols + (editMode ? 2 : 0);
  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessment.number}: Questions
          </h1>
          <div class="ms-auto">
            {editorEnabled && canEdit && origHash ? (
              <EditModeButtons
                csrfToken={csrfToken}
                origHash={origHash}
                zones={mappedQuestions}
                editMode={editMode}
                setEditMode={setEditMode}
              />
            ) : (
              ''
            )}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Assessment questions">
            <thead>
              <tr>
                {editMode && (
                  <>
                    <th>
                      <span class="visually-hidden">Edit</span>
                    </th>
                    <th>
                      <span class="visually-hidden">Delete</span>
                    </th>
                  </>
                )}
                <th>
                  <span class="visually-hidden">Name</span>
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
                {!editMode && <th class="text-end">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {mappedQuestions.map((zone, index) => {
                return (
                  <Zone
                    key={`zone-${index + 1}-${zone.title || 'untitled'}`}
                    zone={zone}
                    zoneNumber={index + 1}
                    nTableCols={nTableCols}
                    questionMap={questionMap}
                    editMode={editMode}
                    urlPrefix={urlPrefix}
                    hasCoursePermissionPreview={hasCoursePermissionPreview}
                    canEdit={canEdit}
                    showAdvanceScorePercCol={showAdvanceScorePercCol}
                    assessmentType={assessmentType}
                    handleAddQuestion={handleAddQuestion}
                    handleEditQuestion={handleEditQuestion}
                    handleDeleteQuestion={handleDeleteQuestion}
                    handleResetButtonClick={handleResetButtonClick}
                    getNextQuestionNumber={getNextQuestionNumber}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
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
          qidValidationError={qidValidationError}
          onHide={() => setEditQuestionModalState({ type: 'closed' })}
        />
      ) : null}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
