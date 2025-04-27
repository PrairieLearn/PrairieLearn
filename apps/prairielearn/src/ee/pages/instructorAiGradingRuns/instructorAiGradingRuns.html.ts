import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.html.js';

export function InstructorAIGradingRuns({ resLocals }: { resLocals: Record<string, any> }) {
  return PageLayout({
    resLocals,
    pageTitle: resLocals.pageTitle,
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    content: html`
      <div class="mb-3">
        <a
          href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
            .id}/manual_grading/assessment_question/${resLocals.assessment_question.id}"
          class="btn btn-sm btn-primary"
        >
          <i class="fa fa-arrow-left" aria-hidden="true"></i>
          Back to manual grading
        </a>
      </div>
      <div id="ai-grading-card" class="card mb-5 mx-auto overflow-hidden" style="max-width: 700px">
        <div class="card-body position-relative">
          <h1 class="h3 text-center">AI Grading</h1>
          <form id="ai-grading-form" name="ai-grading-form" method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <small class="form-text text-muted"> Grading student work using AI. </small>
            <div class="d-flex gap-2 mt-3">
              <button
                type="submit"
                class="btn btn-success"
                name="__action"
                value="ai_grade_assessment"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                data-bs-title="Grade all ungraded submissions using AI"
              >
                Grade All
              </button>
              <button
                type="submit"
                class="btn btn-primary"
                name="__action"
                value="ai_grade_assessment_test"
                data-bs-toggle="tooltip"
                data-bs-placement="bottom"
                data-bs-title="Test accuracy of AI using human-graded examples"
              >
                Test Accuracy
              </button>
            </div>
          </form>
        </div>
      </div>
    `,
  });
}
