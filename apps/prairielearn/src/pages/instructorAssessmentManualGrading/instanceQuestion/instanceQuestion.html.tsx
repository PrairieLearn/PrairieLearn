import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { InstructorInfoPanel } from '../../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../../components/PersonalNotesPanel.js';
import { QuestionContainer } from '../../../components/QuestionContainer.js';
import { QuestionSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.js';
import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { GradingJobSchema, type User } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import { GradingPanel } from './gradingPanel.html.js';
import { RubricSettingsModal } from './rubricSettingsModal.html.js';

export const GradingJobDataSchema = GradingJobSchema.extend({
  score_perc: z.number().nullable(),
  grader_name: z.string().nullable(),
});
export type GradingJobData = z.infer<typeof GradingJobDataSchema>;

export function InstanceQuestion({
  resLocals,
  conflict_grading_job,
  graders,
  assignedGrader,
  lastGrader,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingInfo,
  skipGradedSubmissions,
}: {
  resLocals: ResLocalsForPage['instance-question'];
  conflict_grading_job: GradingJobData | null;
  graders: User[] | null;
  assignedGrader: User | null;
  lastGrader: User | null;
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  /**
   * `aiGradingInfo` is defined when
   * 1. The AI grading feature flag is enabled
   * 2. The question was AI graded
   */
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  skipGradedSubmissions: boolean;
}) {
  return PageLayout({
    resLocals: {
      ...resLocals,
      // instance_question_info is reset to keep the default title from showing the student question number
      instance_question_info: undefined,
    },
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
      pageNote: `Instance - question ${resLocals.instance_question_info.instructor_question_number}`,
    },
    headContent: html`
      ${compiledScriptTag('question.ts')}
      <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
      <script>
        document.urlPrefix = '${resLocals.urlPrefix}';
      </script>
      ${resLocals.question.type !== 'Freeform'
        ? html`
            <script src="${assetPath('javascripts/lodash.min.js')}"></script>
            <script src="${assetPath('javascripts/require.js')}"></script>
            <script src="${assetPath('localscripts/question.js')}"></script>
            <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
          `
        : ''}
      ${unsafeHtml(resLocals.extraHeadersHtml)}
      ${compiledScriptTag('instructorAssessmentManualGradingInstanceQuestion.js')}
    `,
    preContent: html`
      <div class="container-fluid">
        ${renderHtml(
          <QuestionSyncErrorsAndWarnings
            authzData={resLocals.authz_data}
            question={resLocals.question}
            course={resLocals.course}
            urlPrefix={resLocals.urlPrefix}
          />,
        )}
      </div>
    `,
    content: html`
      <h1 class="visually-hidden">Instance Question Manual Grading</h1>
      ${resLocals.assessment_instance.open
        ? html`
            <div class="alert alert-danger" role="alert">
              This assessment instance is still open. Student may still be able to submit new
              answers.
            </div>
          `
        : ''}
      <div class="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0">
            <li class="breadcrumb-item">
              <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/manual_grading">
                Manual grading
              </a>
            </li>
            <li class="breadcrumb-item">
              <a
                href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                  .id}/manual_grading/assessment_question/${resLocals.assessment_question.id}"
              >
                Question ${resLocals.assessment_question.number_in_alternative_group}.
                ${resLocals.question.title}
              </a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">Student submission</li>
          </ol>
        </nav>

        ${aiGradingEnabled
          ? html`
              <form method="POST" class="card px-3 py-2 mb-0">
                <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
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
      ${conflict_grading_job
        ? ConflictGradingJobModal({
            resLocals,
            conflict_grading_job,
            graders,
            lastGrader,
            skipGradedSubmissions,
          })
        : ''}
      <div class="row">
        <div class="col-lg-8 col-12">
          ${QuestionContainer({
            resLocals,
            questionContext: 'manual_grading',
            showFooter: false,
            aiGradingInfo,
          })}
        </div>

        <div class="col-lg-4 col-12">
          <div class="card mb-4 border-info">
            <div class="card-header bg-info">Grading</div>
            <div class="js-main-grading-panel">
              ${GradingPanel({
                resLocals,
                context: 'main',
                graders,
                aiGradingInfo,
                skip_graded_submissions: skipGradedSubmissions,
              })}
            </div>
          </div>

          ${resLocals.file_list.length > 0
            ? PersonalNotesPanel({
                fileList: resLocals.file_list,
                context: 'question',
                courseInstanceId: resLocals.course_instance.id,
                assessment_instance: resLocals.assessment_instance,
                authz_result: resLocals.authz_result,
                variantId: resLocals.variant.id,
                csrfToken: resLocals.__csrf_token,
                allowNewUploads: false,
              })
            : ''}
          ${InstructorInfoPanel({
            course: resLocals.course,
            course_instance: resLocals.course_instance,
            assessment: resLocals.assessment,
            assessment_instance: resLocals.assessment_instance,
            instance_question: resLocals.instance_question,
            assignedGrader,
            lastGrader,
            question: resLocals.question,
            variant: resLocals.variant,
            instance_group: resLocals.instance_group,
            instance_group_uid_list: resLocals.instance_group_uid_list,
            instance_user: resLocals.instance_user,
            authz_data: resLocals.authz_data,
            question_is_shared: resLocals.question_is_shared,
            questionContext: 'manual_grading',
            csrfToken: resLocals.__csrf_token,
          })}
        </div>
      </div>
    `,
    postContent: RubricSettingsModal({ resLocals }),
  });
}

function ConflictGradingJobModal({
  resLocals,
  conflict_grading_job,
  graders,
  lastGrader,
  skipGradedSubmissions,
}: {
  resLocals: ResLocalsForPage['instance-question'];
  conflict_grading_job: GradingJobData;
  graders: User[] | null;
  lastGrader: User | null;
  skipGradedSubmissions: boolean;
}) {
  const lastGraderName = lastGrader?.name ?? lastGrader?.uid ?? 'an unknown grader';
  return html`
    <div id="conflictGradingJobModal" class="modal fade">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header bg-danger text-light">
            <div class="modal-title">Grading conflict identified</div>
            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger" role="alert">
              The submission you have just graded has already been graded by ${lastGraderName}. Your
              score and feedback have not been applied. Please review the feedback below and select
              how you would like to proceed.
            </div>
            <div class="row mb-2">
              <div class="col-lg-6 col-12">
                <div><strong>Existing score and feedback</strong></div>
                <div class="mb-2">
                  ${formatDateYMDHM(
                    resLocals.instance_question.modified_at,
                    resLocals.course_instance.display_timezone,
                  )},
                  by ${lastGraderName}
                </div>
                <div class="card">
                  ${GradingPanel({
                    resLocals,
                    disable: true,
                    skip_text: 'Accept existing score',
                    context: 'existing',
                    skip_graded_submissions: skipGradedSubmissions,
                  })}
                </div>
              </div>
              <div class="col-lg-6 col-12">
                <div><strong>Conflicting score and feedback</strong></div>
                <div class="mb-2">
                  ${conflict_grading_job.date
                    ? `${formatDateYMDHM(
                        conflict_grading_job.date,
                        resLocals.course_instance.display_timezone,
                      )},`
                    : ''}
                  by ${conflict_grading_job.grader_name}
                </div>
                <div class="card">
                  ${GradingPanel({
                    resLocals,
                    custom_points:
                      (conflict_grading_job.score ?? 0) *
                      (resLocals.assessment_question.max_points ?? 0),
                    custom_auto_points: conflict_grading_job.auto_points ?? 0,
                    custom_manual_points: conflict_grading_job.manual_points ?? 0,
                    grading_job: conflict_grading_job,
                    context: 'conflicting',
                    graders,
                    skip_graded_submissions: skipGradedSubmissions,
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
