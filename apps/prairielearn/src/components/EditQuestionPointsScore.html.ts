import { html } from '@prairielearn/html';

export function EditQuestionPointsScoreForm({
  field,
  pointsOrScore,
  maxPoints,
  instanceQuestionId,
  assessmentId,
  rubricId,
  modifiedAt,
  urlPrefix,
  csrfToken,
  popoverId,
}: {
  field: 'points' | 'auto_points' | 'manual_points' | 'score_perc';
  pointsOrScore: number | null;
  maxPoints?: number | null;
  instanceQuestionId: string;
  assessmentId: string;
  rubricId: string | null;
  modifiedAt: string;
  urlPrefix: string;
  csrfToken: string;
  popoverId: string;
}) {
  const manualGradingUrl = `${urlPrefix}/assessment/${assessmentId}/manual_grading/instance_question/${instanceQuestionId}`;
  if (rubricId) {
    return html`
      <div>
        <p>
          This question is configured to use rubrics for grading. Changes must be performed in
          <a href="${manualGradingUrl}">the manual grading page</a>.
        </p>
        <div class="text-right">
          <button
            type="button"
            class="btn btn-secondary"
            onclick="$('#${popoverId}').popover('hide')"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <form method="POST">
      <input type="hidden" name="__action" value="edit_question_points" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="instance_question_id" value="${instanceQuestionId}" />
      <input type="hidden" name="modified_at" value="${modifiedAt}" />
      <div class="form-group">
        <div class="input-group">
          <input
            type="number"
            required
            step="any"
            class="form-control"
            name="${field}"
            value="${pointsOrScore}"
          />
          <div class="input-group-append">
            <span class="input-group-text">
              ${field === 'score_perc' ? '%' : `/${maxPoints ?? 0}`}
            </span>
          </div>
        </div>
      </div>
      <p>
        <small>
          This will also recalculate the total points and total score at 100% credit. This change
          will be overwritten if the question is answered again by the student. You may also update
          the score
          <a href="${manualGradingUrl}">via the manual grading page</a>.
        </small>
      </p>
      <div class="text-right">
        <button
          type="button"
          class="btn btn-secondary"
          onclick="$('#${popoverId}').popover('hide')"
        >
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
