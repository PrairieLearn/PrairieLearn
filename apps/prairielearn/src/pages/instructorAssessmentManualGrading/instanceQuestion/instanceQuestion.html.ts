import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { InstructorInfoPanel } from '../../../components/InstructorInfoPanel.html.js';
import { PersonalNotesPanel } from '../../../components/PersonalNotesPanel.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { GradingJobSchema, User } from '../../../lib/db-types.js';

import { GradingPanel } from './gradingPanel.html.js';
import { RubricSettingsModal } from './rubricSettingsModal.html.js';

export const GradingJobDataSchema = GradingJobSchema.extend({
  score_perc: z.number().nullable(),
  grader_name: z.string().nullable(),
  grading_date_formatted: z.string().nullable(),
});
export type GradingJobData = z.infer<typeof GradingJobDataSchema>;

export function InstanceQuestion({
  resLocals,
  conflict_grading_job,
  graders,
}: {
  resLocals: Record<string, any>;
  conflict_grading_job: GradingJobData | null;
  graders: User[] | null;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../partials/head') %>", {
          ...resLocals,
          pageNote: `Instance - question ${resLocals.instance_question_info.instructor_question_number}`,
          // instance_question_info is reset to keep the default title from showing the student question number
          instance_question_info: undefined,
        })}
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
              <script src="${assetPath(
                  `localscripts/question${resLocals.effectiveQuestionType}.js`,
                )}"></script>
            `
          : ''}
        ${unsafeHtml(resLocals.extraHeadersHtml)}
        ${compiledScriptTag('instructorAssessmentManualGradingInstanceQuestion.js')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../partials/navbar'); %>", resLocals)}
        <div class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../../partials/questionSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
        </div>
        ${RubricSettingsModal({ resLocals })}
        <main id="content" class="container-fluid">
          ${resLocals.assessment_instance.open
            ? html`
                <div class="alert alert-danger" role="alert">
                  This assessment instance is still open. Student may still be able to submit new
                  answers.
                </div>
              `
            : ''}
          ${conflict_grading_job
            ? ConflictGradingJobModal({ resLocals, conflict_grading_job, graders })
            : ''}
          <div class="row">
            <div class="col-lg-8 col-12">
              ${QuestionContainer({ resLocals, questionContext: 'manual_grading' })}
            </div>

            <div class="col-lg-4 col-12">
              <div class="card mb-4 border-info">
                <div class="card-header bg-info text-white">Grading</div>
                <div class="js-main-grading-panel">
                  ${GradingPanel({ resLocals, context: 'main', graders })}
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
                question: resLocals.question,
                variant: resLocals.variant,
                user: resLocals.user,
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
        </main>
      </body>
    </html>
  `.toString();
}

function ConflictGradingJobModal({
  resLocals,
  conflict_grading_job,
  graders,
}: {
  resLocals: Record<string, any>;
  conflict_grading_job: GradingJobData;
  graders: User[] | null;
}) {
  return html`
    <div id="conflictGradingJobModal" class="modal fade">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header bg-danger text-light">
            <div class="modal-title">Grading conflict identified</div>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="alert alert-danger" role="alert">
              The submission you have just graded has already been graded by
              ${resLocals.instance_question.last_grader_name}. Your score and feedback have not been
              applied. Please review the feedback below and select how you would like to proceed.
            </div>
            <div class="row mb-2">
              <div class="col-6">
                <div><strong>Existing score and feedback</strong></div>
                <div>
                  ${resLocals.instance_question.modified_at_formatted}, by
                  ${resLocals.instance_question.last_grader_name}
                </div>
              </div>
              <div class="col-6">
                <div><strong>Conflicting score and feedback</strong></div>
                <div>
                  ${conflict_grading_job.grading_date_formatted}, by
                  ${conflict_grading_job.grader_name}
                </div>
              </div>
            </div>
            <div class="row">
              <div class="col-6">
                <div class="card">
                  ${GradingPanel({
                    resLocals,
                    disable: true,
                    hide_back_to_question: true,
                    skip_text: 'Accept existing score',
                    context: 'existing',
                  })}
                </div>
              </div>
              <div class="col-6">
                <div class="card">
                  ${GradingPanel({
                    resLocals,
                    custom_points:
                      (conflict_grading_job.score ?? 0) * resLocals.assessment_question.max_points,
                    custom_auto_points: conflict_grading_job.auto_points ?? 0,
                    custom_manual_points: conflict_grading_job.manual_points ?? 0,
                    grading_job: conflict_grading_job,
                    context: 'conflicting',
                    graders,
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
