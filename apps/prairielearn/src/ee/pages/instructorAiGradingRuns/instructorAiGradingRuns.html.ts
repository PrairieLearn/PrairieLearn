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
    content: html` <div class="mb-3">
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
        <h3 class="text-center">AI Grading</h3>
        <form id="ai-grading-form" name="ai-grading-form" method="POST">
          <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
          <small class="form-text text-muted"
            >More customizations will be enabled here in the future.</small
          >
          <div>
            <button
              type="submit"
              class="btn btn-success"
              name="__action"
              value="ai_grade_assessment"
            >
              Grade All
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              name="__action"
              value="ai_grade_assessment_test"
            >
              Test All
            </button>
          </div>
        </form>
      </div>`,
  });
}
