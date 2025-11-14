import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { Modal } from '../../../components/Modal.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { RubricSettings } from '../../../components/RubricSettings.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import { StaffAssessmentQuestionSchema } from '../../../lib/client/safe-db-types.js';
import type { InstanceQuestionGroup, User } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { type InstanceQuestionTableData } from './assessmentQuestion.types.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingStats,
  instanceQuestionGroups,
  rubric_data,
}: {
  resLocals: Record<string, any>;
  courseStaff: User[];
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  aiGradingStats: AiGradingGeneralStats | null;
  instanceQuestionGroups: InstanceQuestionGroup[];
  rubric_data: RubricData | null;
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
          rubric_data,
          instanceQuestionGroups,
        },
        'instance-question-table-data',
      )}
    `,
    content: (
      <>
        <AssessmentSyncErrorsAndWarnings
          authzData={authz_data}
          assessment={assessment}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />
        <AssessmentOpenInstancesAlert
          numOpenInstances={num_open_instances}
          assessmentId={assessment.id}
          urlPrefix={urlPrefix}
        />
        <div class="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item">
                <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>
                  {' '}
                  Manual grading{' '}
                </a>
              </li>
              <li class="breadcrumb-item active" aria-current="page">
                Question {number_in_alternative_group}. {question.title}
              </li>
            </ol>
          </nav>

          {aiGradingEnabled && (
            <form method="POST" id="toggle-ai-grading-mode-form" class="card px-3 py-2 mb-0">
              <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
              <input type="hidden" name="__csrf_token" value={__csrf_token} />
              <div class="form-check form-switch mb-0">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="switchCheckDefault"
                  checked={aiGradingMode}
                  // @ts-expect-error -- We don't want to hydrate this part of the DOM
                  onchange="setTimeout(() => this.form.submit(), 150)"
                />
                <label class="form-check-label" for="switchCheckDefault">
                  <i class="bi bi-stars" />
                  AI grading mode
                </label>
              </div>
            </form>
          )}
        </div>

        {aiGradingEnabled && aiGradingMode && (
          <>
            <form method="POST" id="ai-grading-graded">
              <input type="hidden" name="__action" value="ai_grade_assessment_graded" />
              <input type="hidden" name="__csrf_token" value={__csrf_token} />
            </form>
            <form method="POST" id="ai-grading-all">
              <input type="hidden" name="__action" value="ai_grade_assessment_all" />
              <input type="hidden" name="__csrf_token" value={__csrf_token} />
            </form>
          </>
        )}

        <div class="mb-3">
          <Hydrate>
            <RubricSettings
              assessmentQuestion={StaffAssessmentQuestionSchema.parse(assessment_question)}
              rubricData={rubric_data}
              csrfToken={__csrf_token}
              aiGradingStats={aiGradingStats}
              context={{
                course_short_name: resLocals.course.short_name,
                course_instance_short_name: resLocals.course_instance.short_name,
                assessment_tid: resLocals.assessment.tid,
                question_qid: resLocals.question.qid,
              }}
            />
          </Hydrate>
        </div>

        <form name="grading-form" method="POST">
          <input type="hidden" name="__action" value="batch_action" />
          <input type="hidden" name="__csrf_token" value={__csrf_token} />
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center gap-2">
              <h1>Student instance questions</h1>
              <div class="d-flex flex-row gap-2">
                {aiGradingEnabled && aiGradingMode ? (
                  <>
                    <div class="dropdown">
                      <button
                        type="button"
                        class="btn btn-sm btn-light dropdown-toggle"
                        data-bs-toggle="dropdown"
                        name="ai-grading"
                      >
                        <i class="bi bi-stars" aria-hidden="true" /> AI grading
                      </button>
                      <div class="dropdown-menu dropdown-menu-end">
                        <button
                          class="dropdown-item"
                          type="button"
                          // @ts-expect-error -- We don't want to hydrate this part of the DOM
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
                          // @ts-expect-error -- We don't want to hydrate this part of the DOM
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
                    <div class="dropdown">
                      <button
                        type="button"
                        class="btn btn-sm btn-light dropdown-toggle"
                        data-bs-toggle="dropdown"
                        name="ai-instance-question-grouping"
                      >
                        <i class="bi bi-stars" aria-hidden="true" /> AI submission grouping
                      </button>
                      <div class="dropdown-menu dropdown-menu-end">
                        <button
                          class="dropdown-item grading-tag-button"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#group-confirmation-modal-selected"
                        >
                          Group selected submissions
                        </button>
                        <button
                          class="dropdown-item"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#group-confirmation-modal-all"
                        >
                          Group all submissions
                        </button>
                        <button
                          class="dropdown-item"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#group-confirmation-modal-ungrouped"
                        >
                          Group ungrouped submissions
                        </button>

                        <hr class="dropdown-divider" />

                        <button
                          class="dropdown-item"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#delete-all-ai-instance-question-grouping-results-modal"
                        >
                          Delete all AI groupings
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div class="dropdown">
                    <button
                      type="button"
                      class="btn btn-sm btn-light dropdown-toggle grading-tag-button"
                      data-bs-toggle="dropdown"
                      name="status"
                      disabled
                    >
                      <i class="fas fa-tags" /> Tag for grading
                    </button>
                    <div class="dropdown-menu dropdown-menu-end">
                      <div class="dropdown-header">Assign for grading</div>
                      {courseStaff.map((grader) => (
                        <button
                          key={grader.user_id}
                          class="dropdown-item"
                          type="submit"
                          name="batch_action_data"
                          value={JSON.stringify({
                            requires_manual_grading: true,
                            assigned_grader: grader.user_id,
                          })}
                        >
                          <i class="fas fa-user-tag" />
                          Assign to: {grader.name || ''} ({grader.uid})
                        </button>
                      ))}
                      <button
                        class="dropdown-item"
                        type="submit"
                        name="batch_action_data"
                        value={JSON.stringify({ assigned_grader: null })}
                      >
                        <i class="fas fa-user-slash" />
                        Remove grader assignment
                      </button>
                      <div class="dropdown-divider" />
                      <button
                        class="dropdown-item"
                        type="submit"
                        name="batch_action_data"
                        value={JSON.stringify({ requires_manual_grading: true })}
                      >
                        <i class="fas fa-tag" />
                        Tag as required grading
                      </button>
                      <button
                        class="dropdown-item"
                        type="submit"
                        name="batch_action_data"
                        value={JSON.stringify({ requires_manual_grading: false })}
                      >
                        <i class="fas fa-check-square" />
                        Tag as graded
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <table id="grading-table" aria-label="Instance questions for manual grading" />
          </div>
          <div
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{
              __html: GroupInfoModal({
                modalFor: 'selected',
                numOpenInstances: num_open_instances,
                csrfToken: __csrf_token,
              }).toString(),
            }}
          />
        </form>
      </>
    ),
    postContent: [
      GradingConflictModal(),
      DeleteAllAIGradingJobsModal({ csrfToken: __csrf_token }),
      DeleteAllInstanceQuestionGroupResultsModal({ csrfToken: __csrf_token }),
      GroupInfoModal({
        modalFor: 'all',
        numOpenInstances: num_open_instances,
        csrfToken: __csrf_token,
      }),
      GroupInfoModal({
        modalFor: 'ungrouped',
        numOpenInstances: num_open_instances,
        csrfToken: __csrf_token,
      }),
    ],
  });
}

function GradingConflictModal() {
  return Modal({
    id: 'grading-conflict-modal',
    title: 'Grading conflict detected',
    body: renderHtml(<p>Another grader has already graded this submission.</p>),
    footer: renderHtml(
      <>
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
          Dismiss
        </button>
        <a class="btn btn-primary conflict-details-link" href="/">
          See details
        </a>
      </>,
    ),
  });
}

function DeleteAllAIGradingJobsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'delete-all-ai-grading-jobs-modal',
    title: 'Delete all AI grading results',
    body: renderHtml(
      <>
        Are you sure you want to delete <strong>all AI grading results</strong> for this assessment?
        This action cannot be undone.
      </>,
    ),
    footer: renderHtml(
      <>
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="delete_ai_grading_jobs" />
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
          Cancel
        </button>
        <button type="submit" class="btn btn-danger">
          Delete
        </button>
      </>,
    ),
  });
}

function DeleteAllInstanceQuestionGroupResultsModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'delete-all-ai-instance-question-grouping-results-modal',
    title: 'Delete all AI submission groupings',
    body: renderHtml(
      <>
        Are you sure you want to delete <strong>all AI submission groupings</strong> for this
        assessment? This action cannot be undone.
      </>,
    ),
    footer: renderHtml(
      <>
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="delete_ai_instance_question_groupings" />
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
          Cancel
        </button>
        <button type="submit" class="btn btn-danger">
          Delete
        </button>
      </>,
    ),
  });
}

function GroupInfoModal({
  modalFor,
  numOpenInstances,
  csrfToken,
}: {
  modalFor: 'all' | 'selected' | 'ungrouped';
  numOpenInstances: number;
  csrfToken: string;
}) {
  return Modal({
    id: `group-confirmation-modal-${modalFor}`,
    title: run(() => {
      if (modalFor === 'all') {
        return 'Group all submissions';
      } else if (modalFor === 'ungrouped') {
        return 'Group ungrouped submissions';
      } else {
        return 'Group selected submissions';
      }
    }),
    form: modalFor === 'all' || modalFor === 'ungrouped',
    body: renderHtml(
      <>
        {(modalFor === 'all' || modalFor === 'ungrouped') && (
          <>
            <input
              type="hidden"
              name="__action"
              value={
                modalFor === 'all'
                  ? 'ai_instance_question_group_assessment_all'
                  : 'ai_instance_question_group_assessment_ungrouped'
              }
            />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
          </>
        )}
        <p>
          Groups student submission answers based on whether they
          <b>match the correct answer exactly.</b>
        </p>

        <p>Answers that match go into one group, and those that don't are grouped separately.</p>

        <p>
          To enable grouping, the correct answer must be provided in <code>pl-answer-panel</code>.
        </p>

        <p>
          Grouping checks for exact equivalence to the final answer, considering only the boxed or
          final answer to form groups.
        </p>

        <p>Examples of what can and can't be grouped:</p>

        <div
          class="d-grid border rounded overflow-hidden"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          <div class="px-2 py-1 bg-light fw-bold border-end">Can group</div>
          <div class="px-2 py-1 bg-light fw-bold">Can't group</div>

          <div class="px-2 py-1 border-top border-end">Mathematical Equations</div>
          <div class="px-2 py-1 border-top">Essays</div>

          <div class="px-2 py-1 border-top border-end">Mechanical Formulas</div>
          <div class="px-2 py-1 border-top">Free Response Questions</div>

          <div class="px-2 py-1 border-top border-end">Exact String Inputs</div>
          <div class="px-2 py-1 border-top">Freeform Code</div>

          <div class="px-2 py-1 border-top border-end">
            Handwritten submissions with 1 correct answer
          </div>
          <div class="px-2 py-1 border-top">Handwritten submissions with 2+ correct answers</div>
        </div>

        {numOpenInstances > 0 && (
          <div class="alert alert-warning mt-3" role="alert">
            <div class="row g-2">
              <div class="col-12 col-md-6">
                <p class="my-0">
                  This assessment has
                  {numOpenInstances === 1
                    ? '1 open instance that '
                    : `${numOpenInstances} open instances, which `}
                  may contain submissions selected for grouping.
                </p>
              </div>
              <div class="col-12 col-md-6 d-flex flex-column gap-2">
                <p class="my-0">Choose how to apply grouping:</p>
                <select
                  class="form-select w-auto flex-shrink-0"
                  name="closed_instance_questions_only"
                >
                  <option value="true" selected>
                    Only group closed submissions
                  </option>
                  <option value="false">Group open & closed submissions</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </>,
    ),
    footer: renderHtml(
      <div class="m-0">
        <div class="d-flex align-items-center justify-content-end gap-2 mb-1">
          {modalFor === 'all' ? (
            <button class="btn btn-primary" type="submit">
              Group submissions
            </button>
          ) : (
            <button
              class="btn btn-primary"
              type="submit"
              name="batch_action"
              value="ai_instance_question_group_selected"
            >
              Group submissions
            </button>
          )}
        </div>
        <small class="text-muted my-0 text-end">
          AI can make mistakes. Review groups before grading.
        </small>
      </div>,
    ),
  });
}
