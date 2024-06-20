import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../../components/Modal.html.js';
import {
  compiledStylesheetTag,
  compiledScriptTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';

export function AssessmentQuestion({ resLocals }: { resLocals: Record<string, any> }) {
  const {
    number_in_alternative_group,
    urlPrefix,
    assessment,
    assessment_set,
    question,
    __csrf_token,
    authz_data,
    assessment_question,
    course_staff,
  } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../partials/head') %>", {
          ...resLocals,
          pageNote: `Question ${number_in_alternative_group}`,
        })}
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/bootstrap-table.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/extensions/sticky-header/bootstrap-table-sticky-header.min.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/extensions/auto-refresh/bootstrap-table-auto-refresh.js',
          )}"></script>
        <script src="${nodeModulesAssetPath(
            'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
          )}"></script>
        ${compiledScriptTag('instructorAssessmentManualGradingAssessmentQuestionClient.ts')}
        ${compiledStylesheetTag('instructorAssessmentManualGradingAssessmentQuestion.css')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../partials/navbar'); %>", resLocals)}
        ${GradingConflictModal()}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../../partials/assessmentOpenInstancesAlert') %>",
            resLocals,
          )}
          <a
            class="btn btn-primary mb-2"
            href="${urlPrefix}/assessment/${assessment.id}/manual_grading"
          >
            <i class="fas fa-arrow-left"></i>
            Back to ${assessment_set.name} ${assessment.number} Overview
          </a>
          ${renderEjs(
            import.meta.url,
            "<%- include('../../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${assessment.tid} / Question ${number_in_alternative_group}. ${question.title}
            </div>
            <form name="grading-form" method="POST">
              <input type="hidden" name="__action" value="batch_action" />
              <input type="hidden" name="batch_action_data" value="" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
              <table
                id="grading-table"
                data-has-course-instance-permission-edit="${!!authz_data.has_course_instance_permission_edit}"
                data-url-prefix="${urlPrefix}"
                data-assessment-id="${assessment.id}"
                data-assessment-question-id="${assessment_question.id}"
                data-manual-rubric-id="${assessment_question.manual_rubric_id}"
                data-max-points="${assessment_question.max_points}"
                data-group-work="${assessment.group_work}"
                data-max-auto-points="${assessment_question.max_auto_points}"
                data-csrf-token="${__csrf_token}"
                data-course-staff="${JSON.stringify(course_staff)}"
              ></table>
            </form>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function GradingConflictModal() {
  return Modal({
    id: 'grading-conflict-modal',
    title: 'Grading conflict detected',
    body: html`<p>Another grader has already graded this submission.</p>`,
    footer: html`
      <a class="btn btn-primary conflict-details-link" href="/">See details</a>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Dismiss</button>
    `,
  });
}
