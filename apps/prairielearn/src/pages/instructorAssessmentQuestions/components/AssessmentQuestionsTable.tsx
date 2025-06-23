import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../../components/AssessmentQuestions.html.js';
import type { Course } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type { AssessmentQuestionRow } from '../../../models/assessment-question.js';
import { IssueBadge } from '../../../components/IssueBadge.html.js';
import { SyncProblemButton } from '../../../components/SyncProblemButton.html.js';
import { AssessmentBadge } from '../../../components/AssessmentBadge.html.js';
import { TagBadgeList } from '../../../components/TagBadge.html.js';
import { TopicBadge } from '../../../components/TopicBadge.html.js';

export function AssessmentQuestionsTable({
  course,
  questions,
  urlPrefix,
  assessmentType,
  hasCoursePermissionPreview,
  hasCourseInstancePermissionEdit,
}: {
  course: Course;
  questions: AssessmentQuestionRow[];
  assessmentType: string;
  urlPrefix: string;
  hasCoursePermissionPreview: boolean;
  hasCourseInstancePermissionEdit: boolean;
}) {
  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol =
    questions.filter((q) => q.assessment_question_advance_score_perc !== 0).length >= 1;

  const nTableCols = showAdvanceScorePercCol ? 12 : 11;

  function maxPoints({ max_auto_points, max_manual_points, points_list, init_points }) {
    if (max_auto_points || !max_manual_points) {
      if (assessmentType === 'Exam') {
        return (points_list || [max_manual_points]).map((p) => p - max_manual_points).join(',');
      }
      if (assessmentType === 'Homework') {
        return `${init_points - max_manual_points}/${max_auto_points}`;
      }
    } else {
      return `&mdash`;
    }
  }

  function title(question) {
    const number = AssessmentQuestionNumber(question);
    const issueBadge = IssueBadge({
      urlPrefix,
      count: question.open_issue_count ?? 0,
      issueQid: question.qid,
    });
    const title = `${number} ${question.title} ${issueBadge}`;

    if (hasCoursePermissionPreview) {
      return <a href={`${urlPrefix}/question/${question.question_id}/`}>{title}</a>;
    }

    return title;
  }

  return (
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
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((question) => {
            return (
              <>
                <AssessmentQuestionHeaders question={question} nTableCols={nTableCols} />
                <tr>
                  <td>{title(question)}</td>
                  <td>
                    {question.sync_errors
                      ? SyncProblemButton({
                          type: 'error',
                          output: question.sync_errors,
                        })
                      : question.sync_warnings
                        ? SyncProblemButton({
                            type: 'warning',
                            output: question.sync_warnings,
                          })
                        : ''}
                    {idsEqual(course.id, question.course_id)
                      ? question.qid
                      : `@${question.course_sharing_name}/${question.qid}`}
                  </td>
                  <td>${TopicBadge(question.topic)}</td>
                  <td>${TagBadgeList(question.tags)}</td>
                  <td>
                    $
                    {maxPoints({
                      max_auto_points: question.max_auto_points,
                      max_manual_points: question.max_manual_points,
                      points_list: question.points_list,
                      init_points: question.init_points,
                    })}
                  </td>
                  <td>${question.max_manual_points || '—'}</td>$
                  {showAdvanceScorePercCol ? (
                    <td
                      class="${question.assessment_question_advance_score_perc === 0
                            ? 'text-muted'
                            : ''}"
                      data-testid="advance-score-perc"
                    >
                      ${question.assessment_question_advance_score_perc}%
                    </td>
                  ) : (
                    ''
                  )}
                  <td>
                    $
                    {question.mean_question_score
                      ? `${question.mean_question_score.toFixed(3)} %`
                      : ''}
                  </td>
                  <td class="text-center">
                    $
                    {question.number_submissions_hist ? (
                      <div
                        class="js-histmini"
                        data-data="${JSON.stringify(question.number_submissions_hist)}"
                        data-options="${JSON.stringify({ width: 60, height: 20 })}"
                      ></div>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {question.other_assessments?.map((assessment) =>
                      AssessmentBadge({ urlPrefix, assessment }),
                    )}
                  </td>
                  <td class="text-right">
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
                            data-assessment-question-id="${question.id}"
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
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
