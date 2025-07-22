import clsx from 'clsx';
import { useState } from 'preact/hooks';
import { Fragment } from 'preact/jsx-runtime';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../../components/AssessmentQuestions.html.js';
import { IssueBadgeJsx } from '../../../components/IssueBadge.html.js';
import { SyncProblemButtonJsx } from '../../../components/SyncProblemButton.html.js';
import { TagBadgeListJsx } from '../../../components/TagBadge.html.js';
import { TopicBadgeJsx } from '../../../components/TopicBadge.html.js';
import type { StaffCourse } from '../../../lib/client/safe-db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type { AssessmentQuestionRow } from '../../../models/assessment-question.js';

import { ResetQuestionVariantsModal } from './ResetQuestionVariantsModal.js';

function Title({
  question,
  hasCoursePermissionPreview,
  urlPrefix,
}: {
  question: AssessmentQuestionRow;
  hasCoursePermissionPreview: boolean;
  urlPrefix: string;
}) {
  const title = (
    <>
      <AssessmentQuestionNumber question={question} />
      {question.question.title}
    </>
  );
  if (hasCoursePermissionPreview) {
    return <a href={`${urlPrefix}/question/${question.question.id}/`}>{title}</a>;
  }
  return title;
}

export function InstructorAssessmentQuestionsTable({
  course,
  questions,
  urlPrefix,
  assessmentType,
  assessmentSetName,
  assessmentNumber,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
  csrfToken,
}: {
  course: StaffCourse;
  questions: AssessmentQuestionRow[];
  assessmentType: 'Homework' | 'Exam';
  assessmentSetName: string;
  assessmentNumber: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
  csrfToken: string;
}) {
  const [resetAssessmentQuestionId, setResetAssessmentQuestionId] = useState<string>('');
  const [showResetModal, setShowResetModal] = useState(false);

  const handleResetButtonClick = (questionId: string) => {
    setResetAssessmentQuestionId(questionId);
    setShowResetModal(true);
  };

  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol =
    questions.filter((q) => q.assessment_question.effective_advance_score_perc !== 0).length >= 1;

  const nTableCols = showAdvanceScorePercCol ? 12 : 11;

  function maxPoints({
    max_auto_points,
    max_manual_points,
    points_list,
    init_points,
  }: {
    max_auto_points: number | null;
    max_manual_points: number | null;
    points_list: number[] | null;
    init_points: number | null;
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

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            {assessmentSetName} {assessmentNumber}: Questions
          </h1>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Assessment questions">
            <thead>
              <tr>
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
              {questions.map((question) => {
                return (
                  <Fragment key={question.question.qid}>
                    <AssessmentQuestionHeaders question={question} nTableCols={nTableCols} />
                    <tr>
                      <td>
                        <Title
                          question={question}
                          hasCoursePermissionPreview={hasCoursePermissionPreview}
                          urlPrefix={urlPrefix}
                        />
                        <IssueBadgeJsx
                          urlPrefix={urlPrefix}
                          count={question.open_issue_count ?? 0}
                          issueQid={question.question.qid}
                        />
                      </td>
                      <td>
                        {question.question.sync_errors ? (
                          <SyncProblemButtonJsx
                            output={question.question.sync_errors}
                            type="error"
                          />
                        ) : question.question.sync_warnings ? (
                          <SyncProblemButtonJsx
                            output={question.question.sync_warnings}
                            type="warning"
                          />
                        ) : (
                          ''
                        )}
                        {idsEqual(course.id, question.question.course_id)
                          ? question.question.qid
                          : `@${question.course.sharing_name}/${question.question.qid}`}
                      </td>
                      <td>
                        <TopicBadgeJsx topic={question.topic} />
                      </td>
                      <td>
                        <TagBadgeListJsx tags={question.tags} />
                      </td>
                      <td>
                        {maxPoints({
                          max_auto_points: question.assessment_question.max_auto_points,
                          max_manual_points: question.assessment_question.max_manual_points,
                          points_list: question.assessment_question.points_list,
                          init_points: question.assessment_question.init_points,
                        })}
                      </td>
                      <td>{question.assessment_question.max_manual_points || '—'}</td>
                      {showAdvanceScorePercCol ? (
                        <td
                          class={clsx(
                            question.assessment_question.effective_advance_score_perc === 0
                              ? 'text-muted'
                              : '',
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
                          ? `${question.assessment_question.mean_question_score.toFixed(3)}%`
                          : ''}
                      </td>
                      <td class="text-center">
                        {question.assessment_question.number_submissions_hist ? (
                          <div
                            class="js-histmini"
                            data-data={JSON.stringify(
                              question.assessment_question.number_submissions_hist,
                            )}
                            data-options={JSON.stringify({ width: 60, height: 20 })}
                          ></div>
                        ) : (
                          ''
                        )}
                      </td>
                      <td>
                        {question.other_assessments?.map((assessment) => (
                          <div
                            class="d-inline-block me-1"
                            key={`${question.question.qid}-${assessment.assessment_id}`}
                          >
                            <AssessmentBadge urlPrefix={urlPrefix} assessment={assessment} />
                          </div>
                        ))}
                      </td>
                      <td class="text-end">
                        <div class="dropdown js-question-actions">
                          <button
                            type="button"
                            class="btn btn-secondary btn-xs dropdown-toggle"
                            data-bs-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                          >
                            Action <span class="caret"></span>
                          </button>
                          <div class="dropdown-menu">
                            {hasCourseInstancePermissionEdit ? (
                              <button
                                type="button"
                                class="dropdown-item"
                                data-bs-toggle="modal"
                                data-bs-target="#resetQuestionVariantsModal"
                                onClick={() =>
                                  handleResetButtonClick(question.assessment_question.id)
                                }
                              >
                                Reset question variants
                              </button>
                            ) : (
                              <button type="button" class="dropdown-item disabled" disabled>
                                Must have editor permission
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ResetQuestionVariantsModal
        csrfToken={csrfToken}
        assessmentQuestionId={resetAssessmentQuestionId}
        show={showResetModal}
        onHide={() => setShowResetModal(false)}
      />
    </>
  );
}

InstructorAssessmentQuestionsTable.displayName = 'InstructorAssessmentQuestionsTable';
