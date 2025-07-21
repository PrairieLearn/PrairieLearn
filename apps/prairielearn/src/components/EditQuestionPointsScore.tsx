import { escapeHtml, html } from '@prairielearn/html';

import { type AssessmentQuestion, type InstanceQuestion } from '../lib/db-types.js';

type EditableField = 'points' | 'auto_points' | 'manual_points' | 'score_perc';

function findLabel(field: EditableField) {
  return {
    points: 'points',
    auto_points: 'auto points',
    manual_points: 'manual points',
    score_perc: 'score percentage',
  }[field];
}

export function EditQuestionPointsScoreButton({
  field,
  instance_question,
  assessment_question,
  urlPrefix,
  csrfToken,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instance_question: Omit<InstanceQuestion, 'modified_at'> & { modified_at: string };
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  csrfToken: string;
}) {
  const editForm = EditQuestionPointsScoreForm({
    field,
    instance_question,
    assessment_question,
    urlPrefix,
    csrfToken,
  });

  return html`<button
    type="button"
    class="btn btn-xs btn-secondary"
    data-bs-toggle="popover"
    data-bs-container="body"
    data-bs-html="true"
    data-bs-placement="auto"
    aria-label="Change question ${findLabel(field)}"
    data-bs-content="${escapeHtml(editForm)}"
    data-testid="edit-question-points-score-button-${field}"
  >
    <i class="fa fa-edit" aria-hidden="true"></i>
  </button>`;
}

function EditQuestionPointsScoreForm({
  field,
  instance_question,
  assessment_question,
  urlPrefix,
  csrfToken,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  instance_question: Omit<InstanceQuestion, 'modified_at'> & { modified_at: string };
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  csrfToken: string;
}) {
  const manualGradingUrl = `${urlPrefix}/assessment/${assessment_question.assessment_id}/manual_grading/instance_question/${instance_question.id}`;
  // If the question is configured to use rubrics, don't allow editing the
  // points, unless there is no submission, in which case we allow editing the
  // points manually since the manual grading page will not be available.
  if (assessment_question.manual_rubric_id != null && instance_question.status !== 'unanswered') {
    return html`
      <div>
        <p>
          This question is configured to use rubrics for grading. Changes must be performed in
          <a href="${manualGradingUrl}">the manual grading page</a>.
        </p>
        <div class="text-end">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        </div>
      </div>
    `;
  }
  const [pointsOrScore, maxPoints] = {
    points: [instance_question.points, assessment_question.max_points],
    manual_points: [instance_question.manual_points, assessment_question.max_manual_points],
    auto_points: [instance_question.auto_points, assessment_question.max_auto_points],
    score_perc: [instance_question.score_perc, 100],
  }[field];

  return html`
    <form name="edit-points-form" method="POST">
      <input type="hidden" name="__action" value="edit_question_points" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="instance_question_id" value="${instance_question.id}" />
      <input type="hidden" name="modified_at" value="${instance_question.modified_at.toString()}" />
      <div class="mb-3">
        <div class="input-group">
          <input
            type="number"
            required
            step="any"
            class="form-control"
            name="${field}"
            value="${pointsOrScore}"
            aria-label="${findLabel(field)}"
          />
          <span class="input-group-text">
            ${field === 'score_perc' ? '%' : `/${maxPoints ?? 0}`}
          </span>
        </div>
      </div>
      <p>
        <small>
          This will also recalculate the total points and total score at 100% credit. This change
          will be overwritten if the question is answered again by the student.
          ${instance_question.status !== 'unanswered'
            ? html`You may also update the score
                <a href="${manualGradingUrl}">via the manual grading page</a>.`
            : ''}
        </small>
      </p>
      <div class="text-end">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
