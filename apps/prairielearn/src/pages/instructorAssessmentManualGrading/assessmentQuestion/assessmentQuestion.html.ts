import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.html.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import type { User } from '../../../lib/db-types.js';

import { type InstanceQuestionTableData } from './assessmentQuestion.types.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
  aiGradingMode,
}: {
  resLocals: Record<string, any>;
  courseStaff: User[];
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
}) {
  const {
    number_in_alternative_group,
    urlPrefix,
    assessment,
    assessment_set,
    question,
    __csrf_token,
    authz_data,
    assessment_question,
    num_open_instances,
    course_instance,
    course,
  } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
      pageNote: `Question ${number_in_alternative_group}`,
    },
    headContent: html`
      <!-- Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
        from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way. -->
      <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
      <script src="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/auto-refresh/bootstrap-table-auto-refresh.js',
        )}"></script>
      <script src="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
        )}"></script>

      ${compiledScriptTag('bootstrap-table-sticky-header.js')}
      ${compiledScriptTag('instructorAssessmentManualGradingAssessmentQuestionClient.ts')}
      ${compiledStylesheetTag('instructorAssessmentManualGradingAssessmentQuestion.css')}
      ${EncodedData<InstanceQuestionTableData>(
        {
          hasCourseInstancePermissionEdit: !!authz_data.has_course_instance_permission_edit,
          urlPrefix,
          instancesUrl: `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessment_question.id}/instances.json`,
          maxPoints: assessment_question.max_points,
          groupWork: assessment.group_work,
          maxAutoPoints: assessment_question.max_auto_points,
          aiGradingEnabled,
          courseStaff,
          csrfToken: __csrf_token,
          aiGradingMode,
        },
        'instance-question-table-data',
      )}
    `,
    content: html`
      ${AssessmentSyncErrorsAndWarnings({
        authz_data,
        assessment,
        courseInstance: course_instance,
        course,
        urlPrefix,
      })}
      ${AssessmentOpenInstancesAlert({
        numOpenInstances: num_open_instances,
        assessmentId: assessment.id,
        urlPrefix,
      })}

      <a
        class="btn btn-primary mb-2"
        href="${urlPrefix}/assessment/${assessment.id}/manual_grading"
      >
        <i class="fas fa-arrow-left"></i>
        Back to ${assessment_set.name} ${assessment.number} Overview
      </a>
      ${aiGradingEnabled
        ? html`
            <form method="POST" id="toggle-ai-grading-mode">
              <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
            </form>
            <form method="POST" id="ai-grading">
              <input type="hidden" name="__action" value="ai_grade_assessment" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
            </form>
            <form method="POST" id="ai-grading-graded">
              <input type="hidden" name="__action" value="ai_grade_assessment_graded" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
            </form>
            <form method="POST" id="ai-grading-all">
              <input type="hidden" name="__action" value="ai_grade_assessment_all" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
            </form>
          `
        : ''}
      <form name="grading-form" method="POST">
        <div class="card mb-4">
          <div
            class="card-header bg-primary text-white d-flex justify-content-between align-items-center"
          >
            <h1>${assessment.tid} / Question ${number_in_alternative_group}. ${question.title}</h1>
            <div class="d-flex flex-row gap-2">
              <div class="dropdown">
                <button
                  type="button"
                  class="btn btn-sm btn-light dropdown-toggle"
                  data-bs-toggle="dropdown"
                >
                  Actions
                </button>
                <div class="dropdown-menu dropdown-menu-end">
                  <div class="dropdown-header">Delete gradings</div>
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action"
                    value="delete_human_gradings"
                  >
                    Delete human gradings
                  </button>
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action"
                    value="delete_ai_gradings"
                  >
                    Delete AI gradings
                  </button>
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action"
                    value="delete_all_gradings"
                  >
                    Delete all gradings
                  </button>
                </div>
              </div>
            </div>
          </div>
          <input type="hidden" name="__action" value="batch_action" />
          <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
          <table id="grading-table" aria-label="Instance questions for manual grading"></table>
        </div>
      </form>
    `,
    postContent: GradingConflictModal(),
  });
}

function GradingConflictModal() {
  return Modal({
    id: 'grading-conflict-modal',
    title: 'Grading conflict detected',
    body: html`<p>Another grader has already graded this submission.</p>`,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Dismiss</button>
      <a class="btn btn-primary conflict-details-link" href="/">See details</a>
    `,
  });
}
