import { html } from '@prairielearn/html';

import { type Issue, type User } from '../../../lib/db-types.js';

import {
  AutoPointsSection,
  ManualPointsSection,
  TotalPointsSection,
} from './gradingPointsSection.html.js';
import { RubricInputSection } from './rubricInputSection.html.js';

interface SubmissionOrGradingJob {
  feedback: Record<string, any> | null;
}

export function GradingPanel({
  resLocals,
  context,
  graders,
  disable,
  hide_back_to_question,
  skip_text,
  custom_points,
  custom_auto_points,
  custom_manual_points,
  grading_job,
}: {
  resLocals: Record<string, any>;
  context: 'main' | 'existing' | 'conflicting';
  graders?: User[] | null;
  disable?: boolean;
  hide_back_to_question?: boolean;
  skip_text?: string;
  custom_points?: number;
  custom_auto_points?: number;
  custom_manual_points?: number;
  grading_job?: SubmissionOrGradingJob;
}) {
  const auto_points = custom_auto_points ?? resLocals.instance_question.auto_points ?? 0;
  const manual_points = custom_manual_points ?? resLocals.instance_question.manual_points ?? 0;
  const points = custom_points ?? resLocals.instance_question.points ?? 0;
  const submission = grading_job ?? resLocals.submission;
  const assessment_question_url = `${resLocals.urlPrefix}/assessment/${resLocals.assessment_instance.assessment_id}/manual_grading/assessment_question/${resLocals.instance_question.assessment_question_id}`;
  const open_issues: Issue[] = resLocals.issues.filter((issue) => issue.open);
  disable = disable || !resLocals.authz_data.has_course_instance_permission_edit;
  skip_text = skip_text || (disable ? 'Next' : 'Skip');

  return html`
    <form
      name="manual-grading-form"
      method="POST"
      data-max-auto-points="${resLocals.assessment_question.max_auto_points}"
      data-max-manual-points="${resLocals.assessment_question.max_manual_points}"
      data-max-points="${resLocals.assessment_question.max_points}"
      data-rubric-active="${!!resLocals.rubric_data}"
      data-rubric-replace-auto-points="${resLocals.rubric_data?.replace_auto_points}"
      data-rubric-starting-points="${resLocals.rubric_data?.starting_points}"
      data-rubric-max-extra-points="${resLocals.rubric_data?.max_extra_points}"
      data-rubric-min-points="${resLocals.rubric_data?.min_points}"
    >
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="modified_at" value="${resLocals.instance_question.modified_at}" />
      <input type="hidden" name="submission_id" value="${resLocals.submission.id}" />
      <ul class="list-group list-group-flush">
        ${resLocals.assessment_question.max_points
          ? // Percentage-based grading is only suitable if the question has points
            html`
              <li class="list-group-item d-flex justify-content-center">
                <span>Points</span>
                <div class="form-check form-switch mx-2">
                  <input
                    class="form-check-input js-manual-grading-pts-perc-select"
                    name="use_score_perc"
                    id="use-score-perc"
                    type="checkbox"
                  />
                  <label class="form-check-label" for="use-score-perc">Percentage</label>
                </div>
              </li>
            `
          : ''}
        <li class="list-group-item">
          ${ManualPointsSection({ context, disable, manual_points, resLocals })}
          ${!resLocals.rubric_data?.replace_auto_points ||
          (!resLocals.assessment_question.max_auto_points && !auto_points)
            ? RubricInputSection({ resLocals, disable })
            : ''}
        </li>
        ${resLocals.assessment_question.max_auto_points || auto_points
          ? html`
              <li class="list-group-item">
                ${AutoPointsSection({ context, disable, auto_points, resLocals })}
              </li>
              <li class="list-group-item">
                ${TotalPointsSection({ context, disable, points, resLocals })}
                ${resLocals.rubric_data?.replace_auto_points
                  ? RubricInputSection({ resLocals, disable })
                  : ''}
              </li>
            `
          : ''}
        <li class="list-group-item">
          <label>
            Feedback:
            <textarea
              name="submission_note"
              class="form-control js-submission-feedback"
              style="min-height: 1em;"
              ${disable ? 'readonly' : ''}
              aria-describedby="submission-feedback-help-${context}"
            >
${submission.feedback?.manual}</textarea
            >
            <small id="submission-feedback-help-${context}" class="form-text text-muted">
              Markdown formatting, such as *<em>emphasis</em>* or &#96;<code>code</code>&#96;, is
              permitted and will be used to format the feedback when presented to the student.
            </small>
          </label>
        </li>
        ${open_issues.length > 0 && context !== 'existing'
          ? html`
              <li class="list-group-item">
                ${open_issues.map(
                  (issue) => html`
                    <div class="form-check">
                      <input
                        type="checkbox"
                        id="close-issue-checkbox-${issue.id}"
                        class="form-check-input"
                        name="unsafe_issue_ids_close"
                        value="${issue.id}"
                      />
                      <label class="w-100 form-check-label" for="close-issue-checkbox-${issue.id}">
                        Close issue #${issue.id}
                      </label>
                    </div>
                  `,
                )}
              </li>
            `
          : ''}
        <li class="list-group-item d-flex align-items-center">
          ${!hide_back_to_question
            ? html`
                <a class="btn btn-primary" href="${assessment_question_url}">
                  <i class="fas fa-arrow-left"></i>
                  Back to Question
                </a>
              `
            : ''}
          <span class="ms-auto">
            ${!disable
              ? html`
                  <button
                    type="submit"
                    class="btn btn-primary"
                    name="__action"
                    value="add_manual_grade"
                  >
                    Submit
                  </button>
                `
              : ''}
            <div class="btn-group">
              <a
                class="btn btn-secondary"
                href="${assessment_question_url}/next_ungraded?prior_instance_question_id=${resLocals
                  .instance_question.id}"
              >
                ${skip_text}
              </a>
              ${!disable
                ? html`
                    <button
                      type="button"
                      class="btn btn-secondary dropdown-toggle dropdown-toggle-split"
                      data-bs-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                      aria-label="Change assigned grader"
                    ></button>
                    <div class="dropdown-menu dropdown-menu-end">
                      ${(graders || []).map(
                        (grader) => html`
                          <button
                            type="submit"
                            class="dropdown-item"
                            name="__action"
                            value="reassign_${grader.user_id}"
                          >
                            Assign to: ${grader.name} (${grader.uid})
                          </button>
                        `,
                      )}
                      <button
                        type="submit"
                        class="dropdown-item"
                        name="__action"
                        value="reassign_nobody"
                      >
                        Tag for grading without assigned grader
                      </button>
                      <button
                        type="submit"
                        class="dropdown-item"
                        name="__action"
                        value="reassign_graded"
                      >
                        Tag as graded (keep current grade)
                      </button>
                    </div>
                  `
                : ''}
            </div>
          </span>
        </li>
      </ul>
    </form>
  `;
}
