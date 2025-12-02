import clsx from 'clsx';
import { Fragment } from 'preact/jsx-runtime';
import { Dropdown } from 'react-bootstrap';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { AssessmentQuestionNumber } from '../../../components/AssessmentQuestions.js';
import { HistMini } from '../../../components/HistMini.js';
import { IssueBadge } from '../../../components/IssueBadge.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.js';
import { TagBadgeList } from '../../../components/TagBadge.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import type { StaffAssessmentQuestionRow } from '../../../lib/assessment-question.js';
import type { EnumAssessmentType } from '../../../lib/db-types.js';
import type { QuestionAlternativeJson, ZoneQuestionJson } from '../../../schemas/index.js';

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
  alternativeNumber: number | null;
}) {
  const { question } = questionRow;
  const title = (
    <>
      <AssessmentQuestionNumber
        alternativeGroupSize={questionRow.alternative_group_size}
        alternativeGroupNumber={questionNumber}
        numberInAlternativeGroup={alternativeNumber}
      />
      {question.title}
    </>
  );
  if (hasCoursePermissionPreview) {
    return <a href={`${urlPrefix}/question/${question.id}/`}>{title}</a>;
  }
  return title;
}

function maxPointsText({
  max_auto_points,
  max_manual_points,
  auto_points,
  assessmentType,
}: {
  max_auto_points: number | number[] | null;
  max_manual_points: number | null;
  auto_points: number | number[] | null;
  assessmentType: EnumAssessmentType;
}) {
  if (auto_points || !max_manual_points) {
    if (assessmentType === 'Exam') {
      const pointsArray = Array.isArray(auto_points)
        ? auto_points
        : [auto_points ?? max_manual_points];
      return pointsArray.map((p) => (p ?? 0) - (max_manual_points ?? 0)).join(',');
    }
    if (assessmentType === 'Homework') {
      const initPointsValue = Array.isArray(auto_points) ? auto_points[0] : auto_points;
      const maxAutoPointsValue = Array.isArray(max_auto_points)
        ? max_auto_points[0]
        : max_auto_points;
      return `${(initPointsValue ?? 0) - (max_manual_points ?? 0)}/${maxAutoPointsValue ?? 0}`;
    }
  } else {
    return '—';
  }
}

export function AssessmentQuestion({
  id,
  alternative,
  alternativeGroup,
  zoneNumber,
  alternativeGroupNumber,
  alternativeNumber,
  questionMap,
  editMode,
  urlPrefix,
  hasCoursePermissionPreview,
  canEdit,
  showAdvanceScorePercCol,
  assessmentType,
  handleEditQuestion,
  handleDeleteQuestion,
  handleResetButtonClick,
  questionNumber,
  alternativeGroupAutoPoints,
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
  canEdit: boolean;
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
    questionId: string,
    numberInAlternativeGroup?: number,
  ) => void;
  handleResetButtonClick: (questionId: string) => void;
  questionNumber: number;
  alternativeGroupAutoPoints?: number | number[] | null;
}) {
  const question = alternative ?? alternativeGroup;
  const questionId = alternative?.id ?? id;
  if (questionId == null) throw new Error('Either ID or question is required');

  const questionData = questionMap[questionId];

  let maxAutoPoints: number | number[] | null = null;
  if (assessmentType === 'Exam') {
    maxAutoPoints = question.points ?? question.autoPoints ?? null;
  } else {
    maxAutoPoints =
      question.maxPoints ??
      question.maxAutoPoints ??
      alternativeGroup.maxPoints ??
      alternativeGroup.maxAutoPoints ??
      null;
  }

  return (
    <Fragment>
      <tr>
        {editMode && (
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
                  handleDeleteQuestion(
                    zoneNumber,
                    alternativeGroupNumber,
                    questionId,
                    alternativeNumber,
                  )
                }
              >
                <i class="fa fa-trash text-danger" aria-hidden="true" />
              </button>
            </td>
          </>
        )}
        <td>
          <Title
            questionRow={questionData}
            hasCoursePermissionPreview={hasCoursePermissionPreview ?? false}
            urlPrefix={urlPrefix}
            questionNumber={questionNumber}
            alternativeNumber={alternativeNumber ? alternativeNumber + 1 : 1}
          />
          <IssueBadge
            urlPrefix={urlPrefix}
            count={questionData.open_issue_count}
            issueQid={questionData.question.qid}
          />
        </td>
        <td>
          {questionData.question.sync_errors ? (
            <SyncProblemButton output={questionData.question.sync_errors} type="error" />
          ) : questionData.question.sync_warnings ? (
            <SyncProblemButton output={questionData.question.sync_warnings} type="warning" />
          ) : null}
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
            max_auto_points: maxAutoPoints ?? alternativeGroup.maxAutoPoints ?? null,
            max_manual_points: question.manualPoints ?? alternativeGroup.manualPoints ?? null,
            auto_points:
              question.points ?? question.autoPoints ?? alternativeGroupAutoPoints ?? null,
            assessmentType,
          })}
        </td>
        <td>{question.manualPoints ?? alternativeGroup.manualPoints ?? '—'}</td>
        {showAdvanceScorePercCol ? (
          <td
            class={clsx({
              'text-muted': questionData.assessment_question.effective_advance_score_perc === 0,
            })}
            data-testid="advance-score-perc"
          >
            {questionData.assessment_question.effective_advance_score_perc}%
          </td>
        ) : null}
        <td>
          {questionData.assessment_question.mean_question_score
            ? `${questionData.assessment_question.mean_question_score.toFixed(3)} %`
            : null}
        </td>
        <td class="text-center">
          {questionData.assessment_question.number_submissions_hist && (
            <HistMini
              data={questionData.assessment_question.number_submissions_hist}
              options={{ width: 60, height: 20 }}
            />
          )}
        </td>
        <td>
          {questionData.other_assessments?.map((assessment) => {
            return (
              <div key={`${assessment.assessment_id}`} class="d-inline-block me-1">
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
        {!editMode && (
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
                {canEdit ? (
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
        )}
      </tr>
    </Fragment>
  );
}
