import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.html.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import type { User } from '../../../lib/db-types.js';
import { renderHtml } from '../../../lib/preact-html.js';

import { type InstanceQuestionTableData } from './assessmentQuestion.types.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingStats,
}: {
  resLocals: Record<string, any>;
  courseStaff: User[];
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  aiGradingStats: AiGradingGeneralStats | null;
}) {
  const {
    number_in_alternative_group,
    urlPrefix,
    assessment,
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
          csrfToken: __csrf_token,
          aiGradingMode,
        },
        'instance-question-table-data',
      )}
    `,
    content: html`
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authz_data={authz_data}
          assessment={assessment}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />,
      )}
      ${AssessmentOpenInstancesAlert({
        numOpenInstances: num_open_instances,
        assessmentId: assessment.id,
        urlPrefix,
      })}
      <div class="d-flex flex-row justify-content-between align-items-center mb-3">
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0">
            <li class="breadcrumb-item">
              <a href="${urlPrefix}/assessment/${assessment.id}/manual_grading"> Manual grading </a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              Question ${number_in_alternative_group}. ${question.title}
            </li>
          </ol>
        </nav>

        ${aiGradingEnabled
          ? html`
              <form method="POST" class="card px-3 py-2 mb-0">
                <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
                <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                <div class="form-check form-switch mb-0">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    role="switch"
                    id="switchCheckDefault"
                    ${aiGradingMode ? 'checked' : ''}
                    onchange="setTimeout(() => this.form.submit(), 150)"
                  />
                  <label class="form-check-label" for="switchCheckDefault">
                    <i class="bi bi-stars"></i>
                    AI grading mode
                  </label>
                </div>
              </form>
            `
          : ''}
      </div>

      ${aiGradingEnabled && aiGradingMode
        ? html`
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
      ${aiGradingEnabled && aiGradingMode && aiGradingStats
        ? html`
            ${aiGradingStats.rubric_stats.length
              ? html`
                  <div class="card overflow-hidden mb-3">
                    <div class="table-responsive">
                      <table class="table table-sm" aria-label="AI grading rubric item stats">
                        <thead>
                          <tr class="table-light fw-bold">
                            <td>Rubric item</td>
                            <td>AI agreement</td>
                          </tr>
                        </thead>
                        <tbody>
                          ${aiGradingStats.rubric_stats.map(
                            (item) =>
                              html`<tr>
                                <td>${item.rubric_item.description}</td>
                                <td>
                                  ${run(() => {
                                    if (item.disagreement_count) {
                                      return html`
                                        <i class="bi bi-x-square-fill text-danger"></i>
                                        <span class="text-muted">
                                          (${item.disagreement_count}/${aiGradingStats.submission_rubric_count}
                                          disagree)
                                        </span>
                                      `;
                                    }

                                    if (aiGradingStats.submission_rubric_count === 0) {
                                      return html`&mdash;`;
                                    }

                                    return html`<i
                                      class="bi bi-check-square-fill text-success"
                                    ></i>`;
                                  })}
                                </td>
                              </tr>`,
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `
              : html`
                  <div class="card mb-3">
                    <div class="card-body">
                      <div>Submission count: ${aiGradingStats.submission_point_count}</div>
                      <div>
                        Average AI error: ${aiGradingStats.mean_error ?? html`&mdash;`}
                        <small class="text-muted">/${assessment_question.max_manual_points}</small>
                        points
                      </div>
                    </div>
                  </div>
                `}
          `
        : ''}

      <form name="grading-form" method="POST">
        <input type="hidden" name="__action" value="batch_action" />
        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
        <div class="card mb-4">
          <div
            class="card-header bg-primary text-white d-flex justify-content-between align-items-center"
          >
            <h1>Student instance questions</h1>
            <div class="d-flex flex-row gap-2">
              <div class="dropdown">
                <button
                  type="button"
                  class="btn btn-sm btn-light dropdown-toggle grading-tag-button"
                  data-bs-toggle="dropdown"
                  name="status"
                  disabled
                >
                  <i class="fas fa-tags"></i> Tag for grading
                </button>
                <div class="dropdown-menu dropdown-menu-end">
                  <div class="dropdown-header">Assign for grading</div>
                  ${courseStaff?.map(
                    (grader) => html`
                      <button
                        class="dropdown-item"
                        type="submit"
                        name="batch_action_data"
                        value="${JSON.stringify({
                          requires_manual_grading: true,
                          assigned_grader: grader.user_id,
                        })}"
                      >
                        <i class="fas fa-user-tag"></i>
                        Assign to: ${grader.name || ''} (${grader.uid})
                      </button>
                    `,
                  )}
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action_data"
                    value="${JSON.stringify({ assigned_grader: null })}"
                  >
                    <i class="fas fa-user-slash"></i>
                    Remove grader assignment
                  </button>
                  <div class="dropdown-divider"></div>
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action_data"
                    value="${JSON.stringify({ requires_manual_grading: true })}"
                  >
                    <i class="fas fa-tag"></i>
                    Tag as required grading
                  </button>
                  <button
                    class="dropdown-item"
                    type="submit"
                    name="batch_action_data"
                    value="${JSON.stringify({ requires_manual_grading: false })}"
                  >
                    <i class="fas fa-check-square"></i>
                    Tag as graded
                  </button>
                </div>
              </div>

              ${aiGradingEnabled && aiGradingMode
                ? html`
                    <div class="dropdown">
                      <button
                        type="button"
                        class="btn btn-sm btn-light dropdown-toggle"
                        data-bs-toggle="dropdown"
                        name="ai-grading"
                      >
                        <i class="bi bi-stars" aria-hidden="true"></i> AI grading
                      </button>
                      <div class="dropdown-menu dropdown-menu-end">
                        <button
                          class="dropdown-item"
                          type="button"
                          onclick="$('#ai-grading').submit();"
                        >
                          Grade all ungraded
                        </button>
                        <button
                          class="dropdown-item"
                          type="button"
                          onclick="$('#ai-grading-graded').submit();"
                        >
                          Grade all human-graded
                        </button>
                        <button
                          class="dropdown-item grading-tag-button"
                          type="submit"
                          name="batch_action"
                          value="ai_grade_assessment_selected"
                        >
                          Grade selected
                        </button>
                        <button
                          class="dropdown-item"
                          type="button"
                          onclick="$('#ai-grading-all').submit();"
                        >
                          Grade all
                        </button>

                        <hr class="dropdown-divider" />

                        <button
                          class="dropdown-item"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#delete-all-ai-grading-jobs-modal"
                        >
                          Delete all AI grading results
                        </button>
                      </div>
                    </div>
                  `
                : ''}
            </div>
          </div>
          <table id="grading-table" aria-label="Instance questions for manual grading"></table>
        </div>
      </form>
    `,
    postContent: [GradingConflictModal(), DeleteAllAIGradingJobsModal({ csrfToken: __csrf_token })],
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

function DeleteAllAIGradingJobsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'delete-all-ai-grading-jobs-modal',
    title: 'Delete all AI grading results',
    body: html`
      Are you sure you want to delete <strong>all AI grading results</strong> for this assessment?
      This action cannot be undone.
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="delete_ai_grading_jobs" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete</button>
    `,
  });
}
