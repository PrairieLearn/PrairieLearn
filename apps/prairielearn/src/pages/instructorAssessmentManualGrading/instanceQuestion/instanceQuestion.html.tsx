import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { markdownToHtml } from '@prairielearn/markdown';
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
import { getAssessmentManualGradingUrl } from '../../../lib/client/url.js';
import { GradingJobSchema, type InstanceQuestionGroup, type User } from '../../../lib/db-types.js';
import { type RubricData, RubricGradingDataSchema } from '../../../lib/manualGrading.types.js';
import { safeMustacheRender } from '../../../lib/mustache.js';
import type { ResLocalsInstanceQuestionRender } from '../../../lib/question-render.types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import {
  InstanceQuestionAiGrade,
  type InstanceQuestionAiGradeProps,
} from './components/InstanceQuestionAiGrade.js';
import {
  InstanceQuestionGradingPanel,
  type InstanceQuestionGradingPanelProps,
} from './components/InstanceQuestionGradingPanel.js';

export const GradingJobDataSchema = GradingJobSchema.extend({
  score_perc: z.number().nullable(),
  grader_name: z.string().nullable(),
  rubric_grading: RubricGradingDataSchema.nullish(),
});
export type GradingJobData = z.infer<typeof GradingJobDataSchema>;

export function buildInstanceQuestionGradingPanelProps({
  resLocals,
  context,
  graders = [],
  disable = false,
  skipText = 'Next',
  customPoints,
  customAutoPoints,
  customManualPoints,
  gradingJob,
  aiGradingInfo,
  aiGradingMode = false,
  showInstanceQuestionGroup = false,
  selectedInstanceQuestionGroup = null,
  instanceQuestionGroups = [],
  skipGradedSubmissions = false,
  showSubmissionsAssignedToMeOnly = false,
  gradedByHumanName = null,
  enableSingleKeyShortcuts,
}: {
  resLocals: ResLocalsForPage<'instance-question'> & ResLocalsInstanceQuestionRender;
  context: InstanceQuestionGradingPanelProps['context'];
  graders?: User[] | null;
  disable?: boolean;
  skipText?: string;
  customPoints?: number;
  customAutoPoints?: number;
  customManualPoints?: number;
  gradingJob?: GradingJobData;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  aiGradingMode?: boolean;
  showInstanceQuestionGroup?: boolean;
  selectedInstanceQuestionGroup?: InstanceQuestionGroup | null;
  instanceQuestionGroups?: InstanceQuestionGroup[];
  skipGradedSubmissions?: boolean;
  showSubmissionsAssignedToMeOnly?: boolean;
  gradedByHumanName?: string | null;
  enableSingleKeyShortcuts: boolean;
}): InstanceQuestionGradingPanelProps {
  const submission = resLocals.submission;
  if (!submission) throw new Error('submission is missing');
  const rubricData: RubricData | null = resLocals.rubric_data ?? null;

  const graderGuidelinesRendered = (() => {
    const graderGuidelines = rubricData?.rubric.grader_guidelines;
    if (!graderGuidelines) return null;
    const { rendered, error } = safeMustacheRender(graderGuidelines, {
      correct_answers: submission.true_answer ?? {},
      params: submission.params ?? {},
      submitted_answers: submission.submitted_answer,
    });
    const renderedHtml = markdownToHtml(rendered);
    if (!error) return renderedHtml;
    return (
      renderedHtml +
      html` <span class="text-danger small">(template error: ${error})</span>`.toString()
    );
  })();

  const rawRubricGrading = gradingJob
    ? (gradingJob.rubric_grading ?? null)
    : (submission.rubric_grading ?? null);
  const rubricGrading = rawRubricGrading
    ? {
        adjustPoints: rawRubricGrading.adjust_points,
        rubricItems: rawRubricGrading.rubric_items
          ? Object.fromEntries(
              Object.entries(rawRubricGrading.rubric_items).map(([id, item]) => [
                id,
                { score: item.score },
              ]),
            )
          : null,
      }
    : null;
  const feedback = gradingJob ? gradingJob.feedback?.manual : submission.feedback?.manual;

  return {
    context,
    disabled: disable || !resLocals.authz_data.has_course_instance_permission_edit,
    aiGradingMode,
    assessmentQuestion: {
      id: resLocals.assessment_question.id,
      maxAutoPoints: resLocals.assessment_question.max_auto_points ?? 0,
      maxManualPoints: resLocals.assessment_question.max_manual_points ?? 0,
      maxPoints: resLocals.assessment_question.max_points ?? 0,
    },
    instanceQuestion: {
      autoPoints: customAutoPoints ?? resLocals.instance_question.auto_points ?? 0,
      manualPoints: customManualPoints ?? resLocals.instance_question.manual_points ?? 0,
      modifiedAt: resLocals.instance_question.modified_at.toISOString(),
      points: customPoints ?? resLocals.instance_question.points ?? 0,
    },
    submission: {
      feedback: feedback?.toString() ?? '',
      id: submission.id,
      rubricGrading,
    },
    graders: (graders ?? []).map((grader) => ({
      id: grader.id,
      name: grader.name ?? grader.uid,
      uid: grader.uid,
    })),
    graderGuidelinesRendered,
    gradedByHumanName,
    aiGradingInfo: aiGradingInfo
      ? {
          selectedRubricItemIds: aiGradingInfo.selectedRubricItemIds,
          submissionManuallyGraded: aiGradingInfo.submissionManuallyGraded,
        }
      : null,
    openIssueIds: resLocals.issues.filter((issue) => issue.open).map((issue) => issue.id),
    rubricData,
    showInstanceQuestionGroup,
    instanceQuestionGroups: instanceQuestionGroups.map((group) => ({
      description: group.instance_question_group_description,
      id: group.id,
      name: group.instance_question_group_name,
    })),
    selectedInstanceQuestionGroupId: selectedInstanceQuestionGroup?.id ?? null,
    manualInstanceQuestionGroupUrl: `${getAssessmentManualGradingUrl({
      courseInstanceId: resLocals.course_instance.id,
      assessmentId: resLocals.assessment.id,
    })}/instance_question/${resLocals.instance_question.id}/manual_instance_question_group`,
    skipGradedSubmissions,
    showSubmissionsAssignedToMeOnly: resLocals.authz_data.has_course_instance_permission_edit
      ? showSubmissionsAssignedToMeOnly
      : false,
    skipText,
    enableSingleKeyShortcuts,
    csrfToken: resLocals.__csrf_token,
  };
}

export function InstanceQuestion({
  resLocals,
  conflict_grading_job,
  graders,
  assignedGrader,
  lastGrader,
  lastHumanGraderName,
  selectedInstanceQuestionGroup,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingInfo,
  aiGradingStats,
  instanceQuestionGroups,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
  submissionCredits,
  instanceQuestionAiGradeProps,
  enable_single_key_shortcuts,
}: {
  resLocals: ResLocalsForPage<'instance-question'> & ResLocalsInstanceQuestionRender;
  conflict_grading_job: GradingJobData | null;
  graders: User[];
  assignedGrader: User | null;
  lastGrader: User | null;
  lastHumanGraderName: string | null;
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
  instanceQuestionAiGradeProps: InstanceQuestionAiGradeProps | null;
  enable_single_key_shortcuts: boolean;
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
      <style>
        .pl-kbd {
          display: inline-block;
          padding: 0.25rem;
          font-weight: 600;
          text-box: trim-both cap alphabetic;
        }

        .pl-kbd.kbd-semi-transparent {
          background-color: #c9d0d78f;
          color: inherit;
          border: 1px solid currentColor;
        }
      </style>
      ${resLocals.question.type !== 'Freeform'
        ? html`
            <script src="${assetPath('javascripts/lodash.min.js')}"></script>
            <script src="${assetPath('javascripts/require.js')}"></script>
            <script src="${assetPath('localscripts/question.js')}"></script>
            <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
          `
        : ''}
      ${unsafeHtml(resLocals.extraHeadersHtml)}
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
                Question ${resLocals.instance_question_info.instructor_question_number}.
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

      ${instanceQuestionAiGradeProps
        ? hydrateHtml(
            <InstanceQuestionAiGrade
              courseInstanceId={instanceQuestionAiGradeProps.courseInstanceId}
              assessmentId={instanceQuestionAiGradeProps.assessmentId}
              assessmentQuestionId={instanceQuestionAiGradeProps.assessmentQuestionId}
              instanceQuestionId={instanceQuestionAiGradeProps.instanceQuestionId}
              trpcCsrfToken={instanceQuestionAiGradeProps.trpcCsrfToken}
              hasRubric={instanceQuestionAiGradeProps.hasRubric}
              useCustomApiKeys={instanceQuestionAiGradeProps.useCustomApiKeys}
              aiGradingSettingsUrl={instanceQuestionAiGradeProps.aiGradingSettingsUrl}
              availableAiGradingProviders={instanceQuestionAiGradeProps.availableAiGradingProviders}
              aiGradingRelativeCosts={instanceQuestionAiGradeProps.aiGradingRelativeCosts}
              aiGradingLastSelectedModel={instanceQuestionAiGradeProps.aiGradingLastSelectedModel}
              initialOngoingJobSequenceTokens={
                instanceQuestionAiGradeProps.initialOngoingJobSequenceTokens
              }
              hasCourseInstancePermissionEdit={
                instanceQuestionAiGradeProps.hasCourseInstancePermissionEdit
              }
            />,
          )
        : ''}
      ${conflict_grading_job
        ? ConflictGradingJobModal({
            resLocals,
            conflict_grading_job,
            graders,
            lastGrader,
            skipGradedSubmissions,
            showSubmissionsAssignedToMeOnly,
            enable_single_key_shortcuts,
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
          <div class="card mb-4">
            <div class="card-header">Grading</div>
            <div class="js-main-grading-panel">
              ${hydrateHtml(
                <InstanceQuestionGradingPanel
                  data={buildInstanceQuestionGradingPanelProps({
                    resLocals,
                    context: 'main',
                    graders,
                    aiGradingInfo,
                    aiGradingMode,
                    selectedInstanceQuestionGroup,
                    showInstanceQuestionGroup: instanceQuestionGroupsExist && aiGradingMode,
                    instanceQuestionGroups,
                    skipGradedSubmissions,
                    showSubmissionsAssignedToMeOnly,
                    gradedByHumanName: lastHumanGraderName,
                    enableSingleKeyShortcuts: enable_single_key_shortcuts,
                  })}
                />,
              )}
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
  enable_single_key_shortcuts,
}: {
  resLocals: ResLocalsForPage<'instance-question'> & ResLocalsInstanceQuestionRender;
  conflict_grading_job: GradingJobData;
  graders: User[] | null;
  lastGrader: User | null;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  enable_single_key_shortcuts: boolean;
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
                  ${hydrateHtml(
                    <InstanceQuestionGradingPanel
                      data={buildInstanceQuestionGradingPanelProps({
                        resLocals,
                        disable: true,
                        skipText: 'Accept existing score',
                        context: 'existing',
                        skipGradedSubmissions,
                        showSubmissionsAssignedToMeOnly,
                        enableSingleKeyShortcuts: enable_single_key_shortcuts,
                      })}
                    />,
                  )}
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
                  ${hydrateHtml(
                    <InstanceQuestionGradingPanel
                      data={buildInstanceQuestionGradingPanelProps({
                        resLocals,
                        customPoints:
                          (conflict_grading_job.score ?? 0) *
                          (resLocals.assessment_question.max_points ?? 0),
                        customAutoPoints: conflict_grading_job.auto_points ?? 0,
                        customManualPoints: conflict_grading_job.manual_points ?? 0,
                        gradingJob: conflict_grading_job,
                        context: 'conflicting',
                        graders,
                        skipGradedSubmissions,
                        showSubmissionsAssignedToMeOnly,
                        enableSingleKeyShortcuts: enable_single_key_shortcuts,
                      })}
                    />,
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
