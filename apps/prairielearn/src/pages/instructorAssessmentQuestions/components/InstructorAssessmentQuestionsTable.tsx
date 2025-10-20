import clsx from 'clsx';
import { useState } from 'preact/hooks';
import { Fragment } from 'preact/jsx-runtime';
import { Dropdown } from 'react-bootstrap';

import { run } from '@prairielearn/run';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { AlternativeGroupHeader, ZoneHeader } from '../../../components/AssessmentQuestions.js';
import { HistMini } from '../../../components/HistMini.js';
import { IssueBadge } from '../../../components/IssueBadge.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import { TagBadgeList } from '../../../components/TagBadge.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { Assessment, AssessmentQuestion, EnumAssessmentType } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type {
  QuestionAlternativeJson,
  ZoneAssessmentJson,
  ZoneQuestionJson,
} from '../../../schemas/infoAssessment.js';

import { EditQuestionModal } from './EditQuestionModal.js';
import { ExamResetNotSupportedModal } from './ExamResetNotSupportedModal.js';
import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

function Title({
  questionRow,
  hasCoursePermissionPreview,
  urlPrefix,
  questionNumber,
  alternativeNumber,
}: {
  questionRow: StaffAssessmentQuestionRow;
  hasCoursePermissionPreview: boolean;
  urlPrefix: string;
  questionNumber: number;
  alternativeNumber?: number;
}) {
  const { question } = questionRow;
  const title = (
    <>
      {alternativeNumber !== undefined ? (
        <span class="ms-3">
          {questionNumber}.{alternativeNumber + 1}.{' '}
        </span>
      ) : (
        `${questionNumber}. `
      )}
      {question.title}
    </>
  );
  if (hasCoursePermissionPreview) {
    return <a href={`${urlPrefix}/question/${question.id}/`}>{title}</a>;
  }
  return title;
}

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
      <span class="js-edit-mode-buttons">
        <button class="btn btn-sm btn-light mx-1" type="submit">
          <i class="fa fa-save" aria-hidden="true" /> Save and sync
        </button>
        <button class="btn btn-sm btn-light" type="button" onClick={() => window.location.reload()}>
          Cancel
        </button>
      </span>
    </form>
  );
}

function questionDisplayName(course: StaffCourse, question: StaffAssessmentQuestionRow) {
  if (idsEqual(course.id, question.question.course_id)) {
    if (!question.question.qid) throw new Error('Question QID is required');
    return question.question.qid;
  }
  return `@${question.course.sharing_name}/${question.question.qid || ''}`;
}

function maxPointsText({
  max_auto_points,
  max_manual_points,
  points_list,
  init_points,
  assessmentType,
}: {
  max_auto_points: number | null;
  max_manual_points: number | null;
  points_list: number | number[] | null;
  init_points: number | number[] | null;
  assessmentType: EnumAssessmentType;
}) {
  if (max_auto_points || !max_manual_points) {
    if (assessmentType === 'Exam') {
      const pointsArray = Array.isArray(points_list)
        ? points_list
        : [points_list ?? max_manual_points];
      return pointsArray.map((p) => (p ?? 0) - (max_manual_points ?? 0)).join(',');
    }
    if (assessmentType === 'Homework') {
      const initPointsValue = Array.isArray(init_points) ? init_points[0] : init_points;
      return `${(initPointsValue ?? 0) - (max_manual_points ?? 0)}/${max_auto_points}`;
    }
  } else {
    return '—';
  }
}

// TODO: add tests for this function. Something like: for each example/test course
// assessment, load the rows, map through here, generate JSON out the other side,
// and make sure it matches the original.
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
    if (zones[zoneNumber - 1].questions[positionInZone] == null) {
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

// TODO: maybe better name?
function AssessmentQuestion({
  id,
  alternative,
  // TODO: currently unused. We need to be using this instead of the data off of `questionMap`.
  alternativeGroup,
  zoneNumber,
  alternativeGroupNumber,
  alternativeNumber,
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  displayAlternativeNumber,
}: {
  id?: string;
  alternative?: QuestionAlternativeJson;
  alternativeGroup: ZoneQuestionJson;
  nTableCols: number;
  zoneNumber: number;
  alternativeGroupNumber: number;
  alternativeNumber?: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview?: boolean;
  hasCourseInstancePermissionEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
  handleEditQuestion: ({
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
  }) => void;
  handleDeleteQuestion: (
    zoneNumber: number,
    alternativeGroupNumber: number,
    alternativeNumber?: number,
  ) => void;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  displayAlternativeNumber?: number;
}) {
  const question = alternative ?? alternativeGroup;
  const questionId = alternative?.id ?? id;
  if (questionId == null) throw new Error('Either ID or question is required');

  const questionData = questionMap[questionId];

  return (
    <Fragment>
      <tr>
        {editMode ? (
          <>
            <td class="align-content-center">
              <button
                class="btn btn-sm btn-ghost"
                type="button"
                onClick={() => {
                  handleEditQuestion({
                    question,
                    alternativeGroup: alternative ? alternativeGroup : undefined,
                    zoneNumber,
                    alternativeGroupNumber,
                    alternativeNumber,
                  });
                }}
              >
                <i class="fa fa-edit" aria-hidden="true" />
              </button>
            </td>
            <td class="align-content-center">
              <button
                class="btn btn-sm btn-ghost"
                type="button"
                onClick={() =>
                  handleDeleteQuestion(zoneNumber, alternativeGroupNumber, alternativeNumber)
                }
              >
                <i class="fa fa-trash text-danger" aria-hidden="true" />
              </button>
            </td>
          </>
        ) : (
          ''
        )}
        <td>
          <Title
            questionRow={questionData}
            hasCoursePermissionPreview={hasCoursePermissionPreview ?? false}
            urlPrefix={urlPrefix}
            questionNumber={questionNumber}
            alternativeNumber={displayAlternativeNumber}
          />
          <IssueBadge
            urlPrefix={urlPrefix}
            count={questionData.open_issue_count ?? 0}
            issueQid={questionData.question.qid}
          />
        </td>
        <td>
          {questionData.question.sync_errors ? (
            <SyncProblemButton output={questionData.question.sync_errors} type="error" />
          ) : questionData.question.sync_warnings ? (
            <SyncProblemButton output={questionData.question.sync_warnings} type="warning" />
          ) : (
            ''
          )}
          {questionId}
        </td>
        <td>
          <TopicBadge topic={questionData.topic} />
        </td>
        <td>
          <TagBadgeList tags={questionData.tags} />
        </td>
        <td>
          {maxPointsText({
            max_auto_points: question.maxPoints ?? question.maxAutoPoints ?? null,
            max_manual_points: question.manualPoints ?? null,
            points_list: question.points ?? question.autoPoints ?? null,
            init_points: question.points ?? question.autoPoints ?? null,
            assessmentType: assessmentType,
          })}
        </td>
        <td>{question.manualPoints || '—'}</td>
        {showAdvanceScorePercCol ? (
          <td
            class={clsx(
              questionData.assessment_question.effective_advance_score_perc === 0
                ? 'text-muted'
                : '',
            )}
            data-testid="advance-score-perc"
          >
            {questionData.assessment_question.effective_advance_score_perc}%
          </td>
        ) : (
          ''
        )}
        <td>
          {questionData.assessment_question?.mean_question_score
            ? `${questionData.assessment_question.mean_question_score.toFixed(3)} %`
            : ''}
        </td>
        <td class="text-center">
          {questionData.assessment_question?.number_submissions_hist ? (
            <HistMini
              data={questionData.assessment_question.number_submissions_hist}
              options={{ width: 60, height: 20 }}
            />
          ) : (
            ''
          )}
        </td>
        <td>
          {questionData.other_assessments?.map((assessment) => {
            return (
              <div
                key={`${questionData.question.qid}-${assessment.assessment_id}`}
                class="d-inline-block me-1"
              >
                <AssessmentBadge
                  urlPrefix={urlPrefix}
                  assessment={{
                    assessment_id: assessment.assessment_id,
                    color: assessment.assessment_set_color,
                    label: `${assessment.assessment_set_abbreviation}${assessment.assessment_number}`,
                  }}
                />
              </div>
            );
          })}
        </td>
        <td class="text-end">
          <Dropdown>
            <Dropdown.Toggle
              variant="secondary"
              class="dropdown-toggle btn-xs"
              id={`question-actions-${questionData.question.qid}`}
            >
              Action
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {hasCourseInstancePermissionEdit ? (
                <Dropdown.Item
                  as="button"
                  type="button"
                  onClick={() => handleResetButtonClick(questionData.assessment_question.id)}
                >
                  Reset question variants
                </Dropdown.Item>
              ) : (
                <Dropdown.Item disabled>Must have editor permission</Dropdown.Item>
              )}
            </Dropdown.Menu>
          </Dropdown>
        </td>
      </tr>
    </Fragment>
  );
}

function AlternativeGroup({
  alternativeGroup,
  alternativeGroupNumber,
  zoneNumber,
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  getNextQuestionNumber,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  zoneNumber: number;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
  handleEditQuestion: ({
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
  }) => void;
  handleDeleteQuestion: (
    zoneNumber: number,
    alternativeGroupNumber: number,
    alternativeNumber?: number,
  ) => void;
  handleResetButtonClick: (questionId: string) => void;
  getNextQuestionNumber: () => number;
}) {
  const hasAlternatives =
    alternativeGroup.alternatives?.length && alternativeGroup.alternatives?.length > 1;
  // Get the question number once per alternative group
  const currentQuestionNumber = getNextQuestionNumber();
  return (
    // TODO: better index?
    <Fragment>
      {hasAlternatives ? (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={currentQuestionNumber}
          nTableCols={nTableCols}
        />
      ) : null}
      {run(() => {
        if (!hasAlternatives) {
          return (
            <AssessmentQuestion
              id={alternativeGroup.id}
              alternativeGroup={alternativeGroup}
              zoneNumber={zoneNumber}
              alternativeGroupNumber={alternativeGroupNumber}
              nTableCols={nTableCols}
              questionMap={questionMap}
              editMode={editMode}
              urlPrefix={urlPrefix}
              hasCoursePermissionPreview={hasCoursePermissionPreview}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              showAdvanceScorePercCol={showAdvanceScorePercCol}
              assessmentType={assessmentType}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
              questionNumber={currentQuestionNumber}
            />
          );
        }

        return alternativeGroup.alternatives?.map((alternative, alternativeNumber) => {
          return (
            <AssessmentQuestion
              key={alternative.id}
              alternative={alternative}
              alternativeGroup={alternativeGroup}
              zoneNumber={zoneNumber}
              nTableCols={nTableCols}
              alternativeGroupNumber={alternativeGroupNumber}
              alternativeNumber={alternativeNumber}
              questionMap={questionMap}
              editMode={editMode}
              urlPrefix={urlPrefix}
              hasCoursePermissionPreview={hasCoursePermissionPreview}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              showAdvanceScorePercCol={showAdvanceScorePercCol}
              assessmentType={assessmentType}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
              questionNumber={currentQuestionNumber}
              displayAlternativeNumber={alternativeNumber}
            />
          );
        });
      })}
    </Fragment>
  );
}

function Zone({
  zone,
  zoneNumber,
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  getNextQuestionNumber,
}: {
  zone: ZoneAssessmentJson;
  zoneNumber: number;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  showAdvanceScorePercCol: boolean;
  assessmentType: EnumAssessmentType;
  handleAddQuestion: (zoneNumber: number) => void;
  handleEditQuestion: ({
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
  }) => void;
  handleDeleteQuestion: (
    zoneNumber: number,
    alternativeGroupNumber: number,
    alternativeNumber?: number,
  ) => void;
  handleResetButtonClick: (questionId: string) => void;
  getNextQuestionNumber: () => number;
}) {
  return (
    <>
      <ZoneHeader zone={zone} zoneNumber={zoneNumber} nTableCols={nTableCols} />
      {zone.questions.map((alternativeGroup, index) => (
        <AlternativeGroup
          // TODO: better key
          key={index}
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={index + 1}
          nTableCols={nTableCols}
          zoneNumber={zoneNumber}
          questionMap={questionMap}
          editMode={editMode}
          urlPrefix={urlPrefix}
          hasCoursePermissionPreview={hasCoursePermissionPreview}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          showAdvanceScorePercCol={showAdvanceScorePercCol}
          assessmentType={assessmentType}
          handleEditQuestion={handleEditQuestion}
          handleDeleteQuestion={handleDeleteQuestion}
          handleResetButtonClick={handleResetButtonClick}
          getNextQuestionNumber={getNextQuestionNumber}
        />
      ))}
      {/* Add "Add question" button at the end of each zone */}
      {editMode && (
        <tr>
          <td colspan={nTableCols + 1}>
            <button class="btn btn-sm" type="button" onClick={() => handleAddQuestion(zoneNumber)}>
              <i class="fa fa-add" aria-hidden="true" /> Add Question to Zone
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

export function InstructorAssessmentQuestionsTable({
  course,
  questionRows,
  urlPrefix,
  assessment,
  assessmentType,
  assessmentSetName,
  assessmentNumber,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  csrfToken,
  origHash,
  editorEnabled,
}: {
  course: StaffCourse;
  questionRows: StaffAssessmentQuestionRow[];
  assessment: Assessment;
  assessmentType: EnumAssessmentType;
  assessmentSetName: string;
  assessmentNumber: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  csrfToken: string;
  origHash: string;
  editorEnabled: boolean;
}) {
  // TODO: memoize?
  const [questionMap, setQuestionMap] = useState(
    Object.fromEntries(questionRows.map((r) => [questionDisplayName(course, r), r])),
  );

  // TODO: name better; memoize?
  const [mappedQuestions, setMappedQuestion] = useState(() => mapQuestions(course, questionRows));

  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // TODO: Better type.
  const [selectedQuestion, setSelectedQuestion] = useState<
    ZoneQuestionJson | QuestionAlternativeJson | null
  >(null);
  const [selectedQuestionPosition, setSelectedQuestionPosition] = useState<{
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
  } | null>(null);
  const [questionState, setQuestionState] = useState<StaffAssessmentQuestionRow[]>(questionRows);
  const [addQuestion, setAddQuestion] = useState(false);
  const [selectedQuestionDisplayName, setSelectedQuestionDisplayName] = useState<string>('');
  const [selectedAlternativeGroup, setSelectedAlternativeGroup] = useState<ZoneQuestionJson | null>(
    null,
  );
  let questionNumber = 0;
  const getNextQuestionNumber = () => {
    questionNumber++;
    return questionNumber;
  };

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

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
    setAddQuestion(false);
    setSelectedQuestion(question);
    setSelectedAlternativeGroup(alternativeGroup ?? null);
    setSelectedQuestionDisplayName(question.id!);
    setSelectedQuestionPosition({
      zoneNumber,
      alternativeGroupNumber,
      alternativeNumber: alternativeNumber ?? undefined,
    });
    setShowEditModal(true);
  };

  const handleAddQuestion = (zoneNumber: number) => {
    setSelectedQuestion({} as ZoneQuestionJson);
    setSelectedQuestionDisplayName('');
    setSelectedQuestionPosition({
      zoneNumber,
      alternativeGroupNumber: mappedQuestions[zoneNumber - 1].questions.length + 1,
    });
    setAddQuestion(true);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setAddQuestion(false);
  };

  const handleUpdateQuestion = async (
    updatedQuestion: ZoneQuestionJson | QuestionAlternativeJson,
    gradingMethod?: 'auto' | 'manual',
  ) => {
    if (!updatedQuestion.id) return;
    let questionData;
    if (updatedQuestion.id !== selectedQuestion?.id) {
      const res = await fetch(`${window.location.pathname}/${updatedQuestion.id}`, {
        method: 'GET',
      });
      if (!res.ok) {
        throw new Error('Failed to save question');
      }
      questionData = await res.json();
      questionData.assessment = assessment;
      questionData.assessment_question = {
        number: selectedQuestionPosition?.alternativeGroupNumber,
        number_in_alternative_group: selectedQuestionPosition?.alternativeNumber,
      };
      questionData.alternative_group = {
        number: selectedQuestionPosition?.alternativeGroupNumber,
      };
      questionData.alternative_group_size = 1;
      questionData.alternative_group_size = 1;
      setQuestionMap((prev) => ({
        ...prev,
        [updatedQuestion.id!]: questionData,
      }));
    }
    if (!selectedQuestionPosition) return;
    const { zoneNumber, alternativeGroupNumber, alternativeNumber } = selectedQuestionPosition;
    // Update the mappedQuestions state
    setMappedQuestion((prevZones) => {
      const newZones = JSON.parse(JSON.stringify(prevZones)); // Deep clone
      const zone = newZones[zoneNumber - 1];
      if (!zone) return prevZones;

      const question = zone.questions[alternativeGroupNumber - 1];

      // If we're adding a new question (question doesn't exist yet)
      if (!question && addQuestion) {
        zone.questions.push(updatedQuestion);
        return newZones;
      }

      if (!question) return prevZones;

      // Check if we're editing an alternative or the alternative group itself
      if (alternativeNumber !== undefined) {
        // Editing an alternative question
        if (!question.alternatives) return prevZones;
        question.alternatives[alternativeNumber] = {
          ...question.alternatives[alternativeNumber],
          ...updatedQuestion,
        };
      } else {
        // Editing the alternative group
        zone.questions[alternativeGroupNumber - 1] = {
          ...question,
          ...updatedQuestion,
        };
      }

      return newZones;
    });

    handleCloseEditModal();
  };

  const handleDeleteQuestion = (
    zoneNumber: number,
    alternativeGroupNumber: number,
    numberInAlternativeGroup?: number,
  ) => {
    setMappedQuestion((prevZones) => {
      const newZones = JSON.parse(JSON.stringify(prevZones));
      const zone = newZones[zoneNumber - 1];
      if (!zone) return prevZones;
      if (numberInAlternativeGroup) {
        zone.questions[alternativeGroupNumber - 1].alternatives?.splice(
          numberInAlternativeGroup - 1,
          1,
        );
      } else {
        zone.questions.splice(alternativeGroupNumber - 1, 1);
      }
      return newZones;
    });
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol = questionRows.some(
    (q) => q.assessment_question.effective_advance_score_perc !== 0,
  );

  const nTableCols = showAdvanceScorePercCol ? 12 : 11;
  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessmentNumber}: Questions
          </h1>
          <div class="ms-auto">
            {editorEnabled && hasCourseInstancePermissionEdit && origHash ? (
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
                {editMode ? (
                  <>
                    <th>
                      <span class="visually-hidden">Edit</span>
                    </th>
                    <th>
                      <span class="visually-hidden">Delete</span>
                    </th>
                  </>
                ) : (
                  ''
                )}
                <th>
                  <span class="visually-hidden">Name</span>
                </th>
                <th>QID</th>
                <th>Topic</th>
                <th>Tags</th>
                <th>Auto Points</th>
                <th>Manual Points</th>
                {showAdvanceScorePercCol ? <th>Advance Score</th> : ''}
                <th>Mean score</th>
                <th>Num. Submissions Histogram</th>
                <th>Other Assessments</th>
                <th class="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappedQuestions.map((zone, index) => {
                return (
                  <Zone
                    // TODO: better key?
                    key={index}
                    zone={zone}
                    zoneNumber={index + 1}
                    nTableCols={nTableCols}
                    questionMap={questionMap}
                    editMode={editMode}
                    urlPrefix={urlPrefix}
                    hasCoursePermissionPreview={hasCoursePermissionPreview}
                    hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
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
      {editMode && selectedQuestion ? (
        <EditQuestionModal
          question={selectedQuestion}
          alternativeGroup={selectedAlternativeGroup}
          showEditModal={showEditModal}
          assessmentType={assessmentType === 'Homework' ? 'Homework' : 'Exam'}
          questionDisplayName={selectedQuestionDisplayName}
          addQuestion={addQuestion}
          handleUpdateQuestion={handleUpdateQuestion}
          onHide={handleCloseEditModal}
        />
      ) : null}
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
