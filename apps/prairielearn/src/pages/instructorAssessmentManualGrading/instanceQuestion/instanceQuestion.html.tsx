import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatDateYMDHM } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { InstructorInfoPanel } from '../../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../../components/PersonalNotesPanel.js';
import { QuestionContainer } from '../../../components/QuestionContainer.js';
import { RubricSettings } from '../../../components/RubricSettings.js';
import type {
  AiGradingGeneralStats,
  InstanceQuestionAIGradingInfo,
} from '../../../ee/lib/ai-grading/types.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { StaffAssessmentQuestionSchema } from '../../../lib/client/safe-db-types.js';
import { GradingJobSchema, type InstanceQuestionGroup, type User } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import { GradingPanel } from './gradingPanel.html.js';

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
  selectedInstanceQuestionGroup,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingInfo,
  aiGradingStats,
  instanceQuestionGroups,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
  submissionCredits,
}: {
  resLocals: ResLocalsForPage<'instance-question'>;
  conflict_grading_job: GradingJobData | null;
  graders: User[] | null;
  assignedGrader: User | null;
  lastGrader: User | null;
  selectedInstanceQuestionGroup: InstanceQuestionGroup | null;
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  /**
   * `aiGradingInfo` is defined when
   * 1. The AI grading feature flag is enabled
   * 2. The question was AI graded
   */
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  aiGradingStats: AiGradingGeneralStats | null;
  instanceQuestionGroups?: InstanceQuestionGroup[];
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  submissionCredits: number[];
}) {
  const instanceQuestionGroupsExist = instanceQuestionGroups
    ? instanceQuestionGroups.length > 0
    : false;
  const { __csrf_token, rubric_data } = resLocals;

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
      <meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />
      ${compiledScriptTag('question.ts')}
      <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
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
      ${EncodedData(
        {
          instanceQuestionId: resLocals.instance_question.id,
          instanceQuestionGroupsExist,
        },
        'instance-question-data',
      )}
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
      ${submissionCredits.some((credit) => credit !== 100)
        ? html`
            <div class="alert alert-warning" role="alert">
              There are submissions in this assessment instance with credit different than 100%.
              Submitting a manual grade will override any credit limits set for this assessment
              instance.
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

      <div class="mb-3">
        ${hydrateHtml(
          <RubricSettings
            hasCourseInstancePermissionEdit={
              resLocals.authz_data.has_course_instance_permission_edit
            }
            assessmentQuestion={StaffAssessmentQuestionSchema.parse(resLocals.assessment_question)}
            rubricData={rubric_data}
            csrfToken={__csrf_token}
            aiGradingStats={aiGradingStats}
            context={{
              course_short_name: resLocals.course.short_name,
              course_instance_short_name: resLocals.course_instance.short_name,
              assessment_tid: resLocals.assessment.tid,
              question_qid: resLocals.question.qid,
              variant_params: resLocals.variant.params,
              variant_true_answer: resLocals.variant.true_answer,
              submission_submitted_answer: resLocals.submission?.submitted_answer,
            }}
          />,
        )}
      </div>
      ${conflict_grading_job
        ? ConflictGradingJobModal({
            resLocals,
            conflict_grading_job,
            graders,
            lastGrader,
            skipGradedSubmissions,
            showSubmissionsAssignedToMeOnly,
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
                selectedInstanceQuestionGroup,
                showInstanceQuestionGroup: instanceQuestionGroupsExist && aiGradingMode,
                instanceQuestionGroups,
                skip_graded_submissions: skipGradedSubmissions,
                show_submissions_assigned_to_me_only: showSubmissionsAssignedToMeOnly,
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
  });
}

function ConflictGradingJobModal({
  resLocals,
  conflict_grading_job,
  graders,
  lastGrader,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
}: {
  resLocals: ResLocalsForPage<'instance-question'>;
  conflict_grading_job: GradingJobData;
  graders: User[] | null;
  lastGrader: User | null;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
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
                    showInstanceQuestionGroup: false,
                    skip_graded_submissions: skipGradedSubmissions,
                    show_submissions_assigned_to_me_only: showSubmissionsAssignedToMeOnly,
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
                    showInstanceQuestionGroup: false,
                    skip_graded_submissions: skipGradedSubmissions,
                    show_submissions_assigned_to_me_only: showSubmissionsAssignedToMeOnly,
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
