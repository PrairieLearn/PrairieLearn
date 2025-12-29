import assert from 'assert';

import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import { type InstanceQuestionGroup, type Issue, type User } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

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
  skip_text,
  custom_points,
  custom_auto_points,
  custom_manual_points,
  grading_job,
  aiGradingInfo,
  showInstanceQuestionGroup = false,
  selectedInstanceQuestionGroup = null,
  instanceQuestionGroups,
  skip_graded_submissions,
}: {
  resLocals: ResLocalsForPage<'instance-question'>;
  context: 'main' | 'existing' | 'conflicting';
  graders?: User[] | null;
  disable?: boolean;
  skip_text?: string;
  custom_points?: number;
  custom_auto_points?: number;
  custom_manual_points?: number;
  grading_job?: SubmissionOrGradingJob;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  showInstanceQuestionGroup?: boolean;
  selectedInstanceQuestionGroup?: InstanceQuestionGroup | null;
  instanceQuestionGroups?: InstanceQuestionGroup[];
  skip_graded_submissions?: boolean;
}) {
  const auto_points = custom_auto_points ?? resLocals.instance_question.auto_points ?? 0;
  const manual_points = custom_manual_points ?? resLocals.instance_question.manual_points ?? 0;
  const points = custom_points ?? resLocals.instance_question.points ?? 0;
  const submission = grading_job ?? resLocals.submission;

  assert(submission, 'submission is missing');
  assert(resLocals.submission, 'resLocals.submission is missing');

  const open_issues: Issue[] = resLocals.issues.filter((issue) => issue.open);

  disable = disable || !resLocals.authz_data.has_course_instance_permission_edit;
  skip_text = skip_text || 'Next';

  const showSkipGradedSubmissionsButton = !disable && context === 'main';

  const emptyGroup = {
    assessment_question_id: resLocals.assessment_question.id,
    instance_question_group_name: 'No group',
    instance_question_group_description: 'No group assigned.',
    id: null,
  };

  const displayedSelectedGroup = selectedInstanceQuestionGroup ?? emptyGroup;

  const instanceQuestionGroupsWithEmpty = instanceQuestionGroups
    ? [...instanceQuestionGroups, emptyGroup]
    : [emptyGroup];

  const graderGuidelines = resLocals.rubric_data?.rubric.grader_guidelines;

  return html`
    <form
      name="manual-grading-form"
      method="POST"
      data-max-auto-points="${resLocals.assessment_question.max_auto_points}"
      data-max-manual-points="${resLocals.assessment_question.max_manual_points}"
      data-max-points="${resLocals.assessment_question.max_points}"
      data-rubric-active="${!!resLocals.rubric_data}"
      data-rubric-replace-auto-points="${resLocals.rubric_data?.rubric.replace_auto_points}"
      data-rubric-starting-points="${resLocals.rubric_data?.rubric.starting_points}"
      data-rubric-max-extra-points="${resLocals.rubric_data?.rubric.max_extra_points}"
      data-rubric-min-points="${resLocals.rubric_data?.rubric.min_points}"
    >
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input
        type="hidden"
        name="modified_at"
        value="${resLocals.instance_question.modified_at.toISOString()}"
      />
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
        ${showInstanceQuestionGroup && context === 'main'
          ? html`
              <li class="list-group-item align-items-center">
                <label
                  for="instance-question-group-toggle"
                  class="form-label d-flex align-items-center gap-2"
                >
                  Submission Group:
                  ${instanceQuestionGroups && instanceQuestionGroups.length > 0
                    ? html`
                        <div
                          id="instance-question-group-description-tooltip"
                          data-bs-toggle="tooltip"
                          data-bs-html="true"
                          data-bs-title="${displayedSelectedGroup.instance_question_group_description}"
                        >
                          <i class="fas fa-circle-info text-secondary"></i>
                        </div>
                      `
                    : ''}
                </label>
                <div class="dropdown w-100 mb-2" role="combobox">
                  <button
                    id="instance-question-group-toggle"
                    type="button"
                    class="btn dropdown-toggle border border-gray bg-white d-flex justify-content-between align-items-center w-100"
                    aria-label="Change selected submission group"
                    aria-haspopup="listbox"
                    aria-expanded="false"
                    data-bs-toggle="dropdown"
                    data-bs-boundary="window"
                  >
                    <span id="instance-question-group-selection-dropdown-span">
                      ${displayedSelectedGroup.instance_question_group_name}
                    </span>
                  </button>

                  <div class="dropdown-menu py-0 overflow-hidden">
                    <div
                      id="instance-question-group-selection-dropdown"
                      style="max-height: 50vh"
                      class="overflow-auto py-2"
                      role="listbox"
                      aria-labelledby="instance-question-group-toggle"
                    >
                      ${instanceQuestionGroupsWithEmpty.map((group) => {
                        const isSelected = run(() => {
                          if (!group.id) {
                            return displayedSelectedGroup.id === null;
                          }
                          if (!displayedSelectedGroup.id) {
                            return false;
                          }
                          return idsEqual(group.id, displayedSelectedGroup.id);
                        });

                        return html`
                          <a
                            class="dropdown-item ${isSelected ? 'active' : ''}"
                            role="option"
                            aria-current="${isSelected ? 'page' : ''}"
                            href="#"
                            data-id="${group.id}"
                            data-name="${group.instance_question_group_name}"
                            data-description="${group.instance_question_group_description || ''}"
                          >
                            ${group.instance_question_group_name}
                          </a>
                        `;
                      })}
                    </div>
                  </div>
                </div>
              </li>
            `
          : ''}
        ${graderGuidelines
          ? html`
              <li class="list-group-item">
                <div class="mb-1">Guidelines:</div>
                <p class="my-3" style="white-space: pre-line;">${graderGuidelines}</p>
              </li>
            `
          : ''}
        <li class="list-group-item">
          ${ManualPointsSection({ context, disable, manual_points, resLocals })}
          ${!resLocals.rubric_data?.rubric.replace_auto_points ||
          (!resLocals.assessment_question.max_auto_points && !auto_points)
            ? RubricInputSection({ resLocals, disable, aiGradingInfo })
            : ''}
        </li>
        ${resLocals.assessment_question.max_auto_points || auto_points
          ? html`
              <li class="list-group-item">
                ${AutoPointsSection({ context, disable, auto_points, resLocals })}
              </li>
              <li class="list-group-item">
                ${TotalPointsSection({ context, disable, points, resLocals })}
                ${resLocals.rubric_data?.rubric.replace_auto_points
                  ? RubricInputSection({ resLocals, disable, aiGradingInfo })
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
        <li class="list-group-item d-flex align-items-center justify-content-end flex-wrap gap-2">
          <div class="form-check">
            ${showSkipGradedSubmissionsButton
              ? html`
                  <input
                    id="skip_graded_submissions"
                    type="checkbox"
                    class="form-check-input"
                    name="skip_graded_submissions"
                    value="true"
                    ${skip_graded_submissions ? 'checked' : ''}
                  />
                  <label class="form-check-label" for="skip_graded_submissions">
                    Skip graded submissions
                  </label>
                `
              : html`
                  <input
                    id="skip_graded_submissions"
                    type="hidden"
                    name="skip_graded_submissions"
                    value="${skip_graded_submissions ? 'true' : 'false'}"
                  />
                `}
          </div>
          <span class="ms-auto">
            ${!disable
              ? html`
                  ${context === 'main'
                    ? html`
                        <div
                          id="grade-button-with-options"
                          class="btn-group ${selectedInstanceQuestionGroup ? '' : 'd-none'}"
                        >
                          <button
                            type="submit"
                            class="btn btn-primary"
                            name="__action"
                            value="add_manual_grade"
                          >
                            Grade
                          </button>
                          <button
                            id="grade-options-dropdown"
                            type="button"
                            class="btn btn-primary dropdown-toggle dropdown-toggle-split"
                            data-bs-toggle="dropdown"
                            aria-haspopup="true"
                            aria-expanded="false"
                          ></button>
                          <div class="dropdown-menu dropdown-menu-end">
                            <button
                              type="submit"
                              class="dropdown-item"
                              name="__action"
                              value="add_manual_grade"
                            >
                              This instance question
                            </button>

                            <div class="dropdown-divider"></div>

                            <button
                              type="submit"
                              class="dropdown-item"
                              name="__action"
                              value="add_manual_grade_for_instance_question_group_ungraded"
                            >
                              All ungraded instance questions in submission group
                            </button>
                            <button
                              type="submit"
                              class="dropdown-item"
                              name="__action"
                              value="add_manual_grade_for_instance_question_group"
                            >
                              All instance questions in submission group
                            </button>

                            <div class="dropdown-item-text text-muted small">
                              AI can make mistakes. Review submission group assignments before
                              grading.
                            </div>
                          </div>
                        </div>
                      `
                    : ''}
                  <button
                    id="grade-button"
                    type="submit"
                    class="btn btn-primary ${selectedInstanceQuestionGroup ? 'd-none' : ''}"
                    name="__action"
                    value="add_manual_grade"
                  >
                    Grade
                  </button>
                `
              : ''}
            <div class="btn-group">
              <button
                type="submit"
                class="btn btn-secondary"
                name="__action"
                value="next_instance_question"
              >
                ${skip_text}
              </button>
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
                            value="reassign_${grader.id}"
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
