import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';

import { InstructorInfoPanel } from '../../../components/InstructorInfoPanel.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
import { PersonalNotesPanel } from '../../../components/PersonalNotesPanel.html.js';
import { QuestionContainer } from '../../../components/QuestionContainer.html.js';
import { QuestionSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.html.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { DateFromISOString, GradingJobSchema, type User } from '../../../lib/db-types.js';
import { renderHtml } from '../../../lib/preact-html.js';

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
}: {
  resLocals: Record<string, any>;
  conflict_grading_job: GradingJobData | null;
  graders: User[] | null;
  assignedGrader: User | null;
  lastGrader: User | null;
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
            <script src="${assetPath(
                `localscripts/question${resLocals.effectiveQuestionType}.js`,
              )}"></script>
          `
        : ''}
      ${unsafeHtml(resLocals.extraHeadersHtml)}
      ${compiledScriptTag('instructorAssessmentManualGradingInstanceQuestion.js')}
    `,
    preContent: html`
      <div class="container-fluid">
        ${renderHtml(
          <QuestionSyncErrorsAndWarnings
            authz_data={resLocals.authz_data}
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
      ${conflict_grading_job
        ? ConflictGradingJobModal({ resLocals, conflict_grading_job, graders, lastGrader })
        : ''}
      <div class="row">
        <div class="col-lg-8 col-12">
          ${QuestionContainer({ resLocals, questionContext: 'manual_grading', showFooter: false })}
        </div>

        <div class="col-lg-4 col-12">
          <div class="card mb-4 border-info">
            <div class="card-header bg-info">Grading</div>
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
}: {
  resLocals: Record<string, any>;
  conflict_grading_job: GradingJobData;
  graders: User[] | null;
  lastGrader: User | null;
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
                    // The modified_at value may have come from a non-validated query
                    DateFromISOString.parse(resLocals.instance_question.modified_at),
                    resLocals.course_instance.display_timezone,
                  )},
                  by ${lastGraderName}
                </div>
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
