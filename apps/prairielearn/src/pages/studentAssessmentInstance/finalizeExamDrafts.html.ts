import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { EXAM_DRAFT_GRACE_PERIOD_MS } from '../../lib/assessment.shared.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { AssessmentInstanceSubmissionDraft } from '../../models/submission-draft.js';

function draftPreview(answer: Record<string, any>): string {
  const preview = Object.entries(answer)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join('\n');
  return preview.length > 300 ? `${preview.slice(0, 300)}…` : preview;
}

export function FinalizeExamDrafts({
  drafts,
  permissions,
  resLocals,
}: {
  drafts: AssessmentInstanceSubmissionDraft[];
  permissions: Map<string, boolean>;
  resLocals: ResLocalsForPage<'assessment-instance'>;
}) {
  const questions = [...new Set(drafts.map((draft) => draft.instance_question.id))];
  const deadline = new Date(
    resLocals.assessment_instance.date_limit!.getTime() + EXAM_DRAFT_GRACE_PERIOD_MS,
  );
  const timezone = resLocals.course_instance.display_timezone;

  return PageLayout({
    resLocals,
    pageTitle: 'Finish exam',
    navContext: { type: 'student', page: 'assessment_instance' },
    content: html`
      <div class="container my-4">
        <h1 class="h3">Your exam time has ended</h1>
        <p>
          Choose any saved drafts you want to submit. You can choose one draft per question. The
          exam closes when you finish, or automatically at ${formatDate(deadline, timezone)}.
        </p>
        <p>
          You cannot edit these drafts now. Any questions you leave unselected will keep their last
          saved answers.
        </p>
        ${
          resLocals.assessment.team_work
            ? html`<p>Finishing closes this exam for everyone in your group.</p>`
            : ''
        }
        <form method="POST">
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          ${questions.map((questionId) => {
            const questionDrafts = drafts.filter(
              (draft) => draft.instance_question.id === questionId,
            );
            const canSubmit = permissions.get(questionId) ?? false;
            return html`
              <div class="card mb-3">
                <div class="card-body">
                  <label class="form-label fw-bold" for="draft-${questionId}">
                    Question ${questionDrafts[0].question_number}
                  </label>
                  <select
                    class="form-select"
                    id="draft-${questionId}"
                    name="selected_drafts"
                    ${canSubmit ? '' : 'disabled'}
                  >
                    <option value="">Keep the last saved answer</option>
                    ${questionDrafts.map(
                      (draft) => html`
                        <option value="${draft.draft.variant_id}:${draft.draft.user_id}">
                          Draft by ${draft.author_uid}, saved
                          ${formatDate(draft.draft.updated_at, timezone)}
                        </option>
                      `,
                    )}
                  </select>
                  ${
                    canSubmit
                      ? ''
                      : html`<div class="form-text">
                          Your group role cannot submit an answer to this question.
                        </div>`
                  }
                  ${questionDrafts.map(
                    (draft) => html`
                      <div class="mt-2">
                        <small class="text-muted">
                          Draft by ${draft.author_uid}, saved
                          ${formatDate(draft.draft.updated_at, timezone)}:
                        </small>
                        <pre class="border rounded bg-light p-2 mb-0 text-wrap">
${draftPreview(draft.draft.raw_submitted_answer)}</pre>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `;
          })}
          <button type="submit" class="btn btn-primary">Finish exam</button>
        </form>
      </div>
    `,
  });
}
