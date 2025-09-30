import clsx from 'clsx';
import { useState } from 'preact/hooks';
import { Fragment } from 'preact/jsx-runtime';
import { Dropdown } from 'react-bootstrap';

import { run } from '@prairielearn/run';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import {
  AlternativeGroupHeader,
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
  ZoneHeader,
} from '../../../components/AssessmentQuestions.js';
import { HistMini } from '../../../components/HistMini.js';
import { IssueBadge } from '../../../components/IssueBadge.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import { TagBadgeList } from '../../../components/TagBadge.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import type { Assessment } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import { assertNever } from '../../../lib/types.js';
import type { StaffAssessmentQuestionRow } from '../../../models/assessment-question.js';
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
}: {
  questionRow: StaffAssessmentQuestionRow;
  hasCoursePermissionPreview: boolean;
  urlPrefix: string;
}) {
  const { question, assessment_question, alternative_group, alternative_group_size } = questionRow;
  const title = (
    <>
      <AssessmentQuestionNumber
        assessmentQuestion={assessment_question}
        alternativeGroup={alternative_group}
        alternativeGroupSize={alternative_group_size}
      />
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
  questions,
  editMode,
  setEditMode,
}: {
  csrfToken: string;
  origHash: string;
  questions: StaffAssessmentQuestionRow[];
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

  // Serialize questions to zones format
  const zones = serializeQuestionsToZones(questions);

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

// Function to serialize questions to zones format
function serializeQuestionsToZones(questions: StaffAssessmentQuestionRow[]): any[] {
  const zonesMap = new Map<string, any>();

  questions.forEach((question) => {
    const zoneId = question.zone.id;

    if (!zonesMap.has(zoneId)) {
      zonesMap.set(zoneId, {
        title: question.zone.title,
        maxPoints: question.zone.max_points,
        numberChoose: question.zone.number_choose,
        bestQuestions: question.zone.best_questions,
        advanceScorePerc: question.zone.advance_score_perc,
        gradeRateMinutes: question.zone.json_grade_rate_minutes,
        questions: [],
      });
    }

    const zone = zonesMap.get(zoneId);

    // Helper function to create question object with correct points structure
    const createQuestionObject = (question: StaffAssessmentQuestionRow) => {
      const questionObj: any = {
        id: question.question.qid,
        triesPerVariant: question.assessment_question.tries_per_variant,
        advanceScorePerc: question.assessment_question.advance_score_perc,
        gradeRateMinutes: question.assessment_question.json_grade_rate_minutes,
      };

      // Determine assessment type from the question's assessment
      const assessmentType = question.assessment.type;

      if (assessmentType === 'Homework') {
        // For Homework: use either auto points OR manual points based on grading method
        const isAutoGraded = question.assessment_question.max_manual_points === 0;

        if (isAutoGraded) {
          // Auto grading: use autoPoints and maxAutoPoints
          questionObj.autoPoints = question.assessment_question.init_points;
          questionObj.maxAutoPoints = question.assessment_question.max_auto_points;
          questionObj.manualPoints = 0; // Set to 0 for Homework auto grading
        } else {
          // Manual grading: use manualPoints only
          questionObj.manualPoints = question.assessment_question.max_manual_points;
          questionObj.autoPoints = 0; // Set to 0 for Homework manual grading
          questionObj.maxAutoPoints = 0; // Set to 0 for Homework manual grading
        }
      } else {
        // For Exam: always include both autoPoints and manualPoints
        questionObj.autoPoints =
          question.assessment_question.points_list || question.assessment_question.init_points;
        questionObj.maxAutoPoints = question.assessment_question.max_auto_points;
        questionObj.manualPoints = question.assessment_question.max_manual_points;
      }

      return questionObj;
    };

    // Check if this question starts a new alternative group
    if (question.start_new_alternative_group) {
      // Check if this is a single question or the start of an alternative group
      if (question.alternative_group_size === 1) {
        // Single question - add directly to zone.questions
        zone.questions.push(createQuestionObject(question));
      } else {
        // Start of an alternative group
        const alternativeGroup: any = {
          numberChoose: question.alternative_group.number_choose,
          alternatives: [],
        };

        // Add the current question to this alternative group
        alternativeGroup.alternatives.push(createQuestionObject(question));

        zone.questions.push(alternativeGroup);
      }
    } else {
      // Add to the last alternative group (this should only happen for alternative groups)
      const lastQuestion = zone.questions[zone.questions.length - 1];
      if (lastQuestion && lastQuestion.alternatives) {
        lastQuestion.alternatives.push(createQuestionObject(question));
      }
    }
  });

  return Array.from(zonesMap.values());
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
  points_list: number[] | null;
  init_points: number | null;
  // TODO: this should be its own `EnumAssessmentType` type.
  assessmentType: Assessment['type'];
}) {
  if (max_auto_points || !max_manual_points) {
    if (assessmentType === 'Exam') {
      return (points_list || [max_manual_points])
        .map((p) => (p ?? 0) - (max_manual_points ?? 0))
        .join(',');
    }
    if (assessmentType === 'Homework') {
      return `${(init_points ?? 0) - (max_manual_points ?? 0)}/${max_auto_points}`;
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
      canView: row.zone.json_can_view ?? undefined,
      canSubmit: row.zone.json_can_submit ?? undefined,
    };

    if (row.alternative_group.number == null) throw new Error('Alternative group number required');

    // Missing json properties: points, autoPoints, maxPoints, maxAutoPoints, manualPoints, forceMaxPoints, triesPerVariant
    zones[row.zone.number - 1].questions[row.alternative_group.number - 1] ??= {
      comment: row.alternative_group.json_comment ?? undefined,
      advanceScorePerc: row.alternative_group.advance_score_perc ?? undefined,
      // TODO: update schemas to not have defaults so we can use `undefined`?
      // Otherwise make sure we normalize the empty array to a null comment.
      canView: row.alternative_group.json_can_view ?? [],
      canSubmit: row.alternative_group.json_can_submit ?? [],
      gradeRateMinutes: row.alternative_group.json_grade_rate_minutes ?? undefined,
      numberChoose: row.alternative_group.number_choose ?? 1,
      // TODO: are we missing a `json_tries_per_variant` column here?
      // We'll default to 1 for now to make progress, but we'll need to address this.
      triesPerVariant: 1,
    };

    if (row.alternative_group.json_has_alternatives) {
      if (row.assessment_question.number_in_alternative_group == null) {
        throw new Error('Assessment question number is required');
      }

      zones[row.zone.number - 1].questions[row.alternative_group.number - 1].alternatives ??= [];
      zones[row.zone.number - 1].questions[row.alternative_group.number - 1].alternatives[
        row.assessment_question.number_in_alternative_group - 1
      ] = {
        // missing json properties: points, autoPoints, maxPoints, maxAutoPoints, manualPoints, forceMaxPoints, triesPerVariant
        comment: row.assessment_question.json_comment ?? undefined,
        id: questionDisplayName(course, row),
        forceMaxPoints: row.assessment_question.force_max_points ?? undefined,
        triesPerVariant: row.assessment_question.tries_per_variant ?? 1,
        advanceScorePerc: row.assessment_question.advance_score_perc ?? undefined,
        gradeRateMinutes: row.assessment_question.grade_rate_minutes ?? undefined,
      };
    } else {
      zones[row.zone.number - 1].questions[row.alternative_group.number - 1].id =
        questionDisplayName(course, row);
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
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  showAdvanceScorePercCol,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
}: {
  id?: string;
  alternative?: QuestionAlternativeJson;
  alternativeGroup: ZoneQuestionJson;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview?: boolean;
  hasCourseInstancePermissionEdit: boolean;
  showAdvanceScorePercCol: boolean;
  handleEditQuestion: (question: StaffAssessmentQuestionRow) => void;
  handleDeleteQuestion: (qid: string) => void;
  handleResetButtonClick: (questionId: string) => void;
}) {
  const questionId = alternative?.id ?? id;
  if (questionId == null) throw new Error('Either ID or question is required');

  const question = questionMap[questionId];
  console.log(question);

  return (
    <Fragment>
      <tr>
        {editMode ? (
          <>
            <td class="align-content-center">
              <button
                class="btn btn-sm btn-secondary"
                type="button"
                onClick={() => {
                  console.log('question', question);
                  handleEditQuestion(question);
                }}
              >
                <i class="fa fa-edit" aria-hidden="true" />
              </button>
            </td>
            <td class="align-content-center">
              <button
                class="btn btn-sm btn-danger"
                type="button"
                onClick={() => handleDeleteQuestion(questionId)}
              >
                <i class="fa fa-trash" aria-hidden="true" />
              </button>
            </td>
          </>
        ) : (
          ''
        )}
        <td>
          <Title
            questionRow={question}
            hasCoursePermissionPreview={hasCoursePermissionPreview ?? false}
            urlPrefix={urlPrefix}
          />
          <IssueBadge
            urlPrefix={urlPrefix}
            count={question.open_issue_count ?? 0}
            issueQid={question.question.qid}
          />
        </td>
        <td>
          {question.question.sync_errors ? (
            <SyncProblemButton output={question.question.sync_errors} type="error" />
          ) : question.question.sync_warnings ? (
            <SyncProblemButton output={question.question.sync_warnings} type="warning" />
          ) : (
            ''
          )}
          {questionId}
        </td>
        <td>
          <TopicBadge topic={question.topic} />
        </td>
        <td>
          <TagBadgeList tags={question.tags} />
        </td>
        <td>
          {maxPointsText({
            max_auto_points: question.assessment_question.max_auto_points,
            max_manual_points: question.assessment_question.max_manual_points,
            points_list: question.assessment_question.points_list,
            init_points: question.assessment_question.init_points,
            assessmentType: question.assessment.type,
          })}
        </td>
        <td>{question.assessment_question.max_manual_points || '—'}</td>
        {showAdvanceScorePercCol ? (
          <td
            class={clsx(
              question.assessment_question.effective_advance_score_perc === 0 ? 'text-muted' : '',
            )}
            data-testid="advance-score-perc"
          >
            {question.assessment_question.effective_advance_score_perc}%
          </td>
        ) : (
          ''
        )}
        <td>
          {question.assessment_question.mean_question_score
            ? `${question.assessment_question.mean_question_score.toFixed(3)} %`
            : ''}
        </td>
        <td class="text-center">
          {question.assessment_question.number_submissions_hist ? (
            <HistMini
              data={question.assessment_question.number_submissions_hist}
              options={{ width: 60, height: 20 }}
            />
          ) : (
            ''
          )}
        </td>
        <td>
          {question.other_assessments?.map((assessment) => {
            return (
              <div
                key={`${question.question.qid}-${assessment.assessment_id}`}
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
              id={`question-actions-${question.question.qid}`}
            >
              Action
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {hasCourseInstancePermissionEdit ? (
                <Dropdown.Item
                  as="button"
                  type="button"
                  onClick={() => handleResetButtonClick(question.assessment_question.id)}
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
  nTableCols,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  showAdvanceScorePercCol,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
}: {
  alternativeGroup: ZoneQuestionJson;
  alternativeGroupNumber: number;
  nTableCols: number;
  questionMap: Record<string, StaffAssessmentQuestionRow>;
  editMode: boolean;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  showAdvanceScorePercCol: boolean;
  handleEditQuestion: (question: StaffAssessmentQuestionRow) => void;
  handleDeleteQuestion: (qid: string) => void;
  handleResetButtonClick: (questionId: string) => void;
}) {
  return (
    // TODO: better index?
    <Fragment>
      {(alternativeGroup.alternatives?.length ?? 0) > 1 ? (
        <AlternativeGroupHeader
          alternativeGroup={alternativeGroup}
          alternativeGroupNumber={alternativeGroupNumber}
          nTableCols={nTableCols}
        />
      ) : null}
      {run(() => {
        if (alternativeGroup.id) {
          return (
            <AssessmentQuestion
              id={alternativeGroup.id}
              alternativeGroup={alternativeGroup}
              nTableCols={nTableCols}
              questionMap={questionMap}
              editMode={editMode}
              urlPrefix={urlPrefix}
              hasCoursePermissionPreview={hasCoursePermissionPreview}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              showAdvanceScorePercCol={showAdvanceScorePercCol}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
            />
          );
        }

        return alternativeGroup.alternatives?.map((alternative) => {
          return (
            <AssessmentQuestion
              key={alternative.id}
              alternative={alternative}
              alternativeGroup={alternativeGroup}
              nTableCols={nTableCols}
              questionMap={questionMap}
              editMode={editMode}
              urlPrefix={urlPrefix}
              hasCoursePermissionPreview={hasCoursePermissionPreview}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              showAdvanceScorePercCol={showAdvanceScorePercCol}
              handleEditQuestion={handleEditQuestion}
              handleDeleteQuestion={handleDeleteQuestion}
              handleResetButtonClick={handleResetButtonClick}
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
  handleAddQuestion,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
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
  handleAddQuestion: (zone: StaffAssessmentQuestionRow['zone']) => void;
  handleEditQuestion: (question: StaffAssessmentQuestionRow) => void;
  handleDeleteQuestion: (qid: string) => void;
  handleResetButtonClick: (questionId: string) => void;
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
          questionMap={questionMap}
          editMode={editMode}
          urlPrefix={urlPrefix}
          hasCoursePermissionPreview={hasCoursePermissionPreview}
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          showAdvanceScorePercCol={showAdvanceScorePercCol}
          handleAddQuestion={handleAddQuestion}
          handleEditQuestion={handleEditQuestion}
          handleDeleteQuestion={handleDeleteQuestion}
          handleResetButtonClick={handleResetButtonClick}
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
  assessmentType: 'Homework' | 'Exam';
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
  const questionMap = Object.fromEntries(
    questionRows.map((r) => [questionDisplayName(course, r), r]),
  );

  // TODO: name better; memoize?
  const [mappedQuestions, setMappedQuestion] = useState(() => mapQuestions(course, questionRows));

  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // TODO: Better type.
  const [selectedQuestion, setSelectedQuestion] = useState<StaffAssessmentQuestionRow | null>(null);
  const [selectedQuestionPosition, setSelectedQuestionPosition] = useState<{
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
  } | null>(null);
  const [questionState, setQuestionState] = useState<StaffAssessmentQuestionRow[]>(questionRows);
  const [addQuestion, setAddQuestion] = useState(false);
  const [selectedQuestionDisplayName, setSelectedQuestionDisplayName] = useState<string>('');

  const handleResetButtonClick = (assessmentQuestionId: string) => {
    setResetAssessmentQuestionId(assessmentQuestionId);
    setShowResetModal(true);
  };

  const handleEditQuestion = ({
    question,
    questionDisplayName,
    zoneNumber,
    alternativeGroupNumber,
    alternativeNumber,
  }: {
    question: StaffAssessmentQuestionRow;
    questionDisplayName: string;
    zoneNumber: number;
    alternativeGroupNumber: number;
    alternativeNumber?: number;
  }) => {
    setAddQuestion(false);
    console.log('handleEditQuestion question', question);
    setSelectedQuestion(question);
    setSelectedQuestionDisplayName(questionDisplayName);
    setSelectedQuestionPosition({
      zoneNumber,
      alternativeGroupNumber,
      alternativeNumber: alternativeNumber ?? undefined,
    });
    setShowEditModal(true);
  };

  const handleAddQuestion = (zoneNumber: number) => {
    setSelectedQuestion({});
    setSelectedQuestionDisplayName('');
    setSelectedQuestionPosition({
      zoneNumber,
      alternativeGroupNumber: mappedQuestions[zoneNumber - 1].questions.length,
    });
    setAddQuestion(true);
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setAddQuestion(false);
  };

  // Function to renumber questions after adding/removing questions
  const renumberQuestions = (
    questions: StaffAssessmentQuestionRow[],
  ): StaffAssessmentQuestionRow[] => {
    // Count questions in each alternative group
    const groupCounts: Record<string, number> = {};
    for (const question of questions) {
      const groupId = question.alternative_group.id;
      groupCounts[groupId] = (groupCounts[groupId] || 0) + 1;
    }

    let prevZoneId: string | null = null;
    let prevAltGroupId: string | null = null;
    let currentAltGroupNumber = 0;

    return questions.map((question) => {
      const start_new_zone = question.zone.id !== prevZoneId;
      const start_new_alternative_group = question.alternative_group.id !== prevAltGroupId;

      // If this is a new alternative group, increment the group number
      if (start_new_alternative_group) {
        currentAltGroupNumber++;
      }

      // Update alternative group size
      const alternative_group_size = groupCounts[question.alternative_group.id];

      // Update the alternative group number
      const updatedAlternativeGroup = {
        ...question.alternative_group,
        number: currentAltGroupNumber,
      };

      // Update the assessment question number within the alternative group
      const questionsInSameGroup = questions.filter(
        (q) => q.alternative_group.id === question.alternative_group.id,
      );
      const questionIndexInGroup = questionsInSameGroup.findIndex(
        (q) => q.question.id === question.question.id,
      );
      const number_in_alternative_group = questionIndexInGroup + 1;

      const updatedAssessmentQuestion = {
        ...question.assessment_question,
        number: currentAltGroupNumber,
        number_in_alternative_group,
      };

      prevZoneId = question.zone.id;
      prevAltGroupId = question.alternative_group.id;

      return {
        ...question,
        start_new_zone,
        start_new_alternative_group,
        alternative_group_size,
        alternative_group: updatedAlternativeGroup,
        assessment_question: updatedAssessmentQuestion,
      };
    });
  };

  const handleUpdateQuestion = (
    updatedQuestion: StaffAssessmentQuestionRow,
    gradingMethod?: 'auto' | 'manual',
  ) => {
    // For Homework assessments, ensure points are correctly set based on grading method
    if (assessmentType === 'Homework' && gradingMethod) {
      if (gradingMethod === 'auto') {
        // Auto grading: ensure manual points are 0
        updatedQuestion.assessment_question.max_manual_points = 0;
      } else {
        // Manual grading: ensure auto points are 0
        updatedQuestion.assessment_question.init_points = 0;
        updatedQuestion.assessment_question.max_auto_points = 0;
      }
    }

    if (addQuestion) {
      // Add new question to the state in the correct zone position and renumber
      setQuestionState((prevState) => {
        // Find the correct position to insert the new question within its zone
        const targetZoneId = updatedQuestion.zone.id;
        let insertIndex = prevState.length; // Default to end if zone not found

        // Find the last question in the target zone
        for (let i = prevState.length - 1; i >= 0; i--) {
          if (prevState[i].zone.id === targetZoneId) {
            insertIndex = i + 1; // Insert after the last question in this zone
            break;
          }
        }

        // Insert the new question at the correct position
        const newState = [
          ...prevState.slice(0, insertIndex),
          updatedQuestion,
          ...prevState.slice(insertIndex),
        ];

        return renumberQuestions(newState);
      });
    } else {
      // Update existing question
      setQuestionState((prevState) =>
        prevState.map((q) =>
          q.question.qid === updatedQuestion.question.qid ? updatedQuestion : q,
        ),
      );
    }
    handleCloseEditModal();
  };

  const handleDeleteQuestion = ({ qid }: { qid: string | null }) => {
    setQuestionState((prevState) => {
      const filteredState = prevState.filter((q) => q.question.qid !== qid);
      return renumberQuestions(filteredState);
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
                questions={questionState}
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
                    handleAddQuestion={handleAddQuestion}
                    handleEditQuestion={handleEditQuestion}
                    handleDeleteQuestion={handleDeleteQuestion}
                    handleResetButtonClick={handleResetButtonClick}
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
          showEditModal={showEditModal}
          assessmentType={assessmentType}
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
