import assert from 'assert';

import mustache from 'mustache';
import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html, unsafeHtml } from '@prairielearn/html';
import { markdownToHtml } from '@prairielearn/markdown';
import { hydrateHtml } from '@prairielearn/react/server';

import { InstructorInfoPanel } from '../../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../../components/PersonalNotesPanel.js';
import { QuestionContainer } from '../../../components/QuestionContainer.js';
import type {
  AiGradingGeneralStats,
  InstanceQuestionAIGradingInfo,
} from '../../../ee/lib/ai-grading/types.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import {
  StaffAssessmentQuestionSchema,
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { GradingJobSchema, type InstanceQuestionGroup, type User } from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import { ManualGradingInstanceQuestionPage } from './ManualGradingInstanceQuestionPage.js';

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
  trpcCsrfToken,
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
  trpcCsrfToken: string;
}) {
  const instanceQuestionGroupsExist = instanceQuestionGroups
    ? instanceQuestionGroups.length > 0
    : false;
  const { __csrf_token, rubric_data } = resLocals;

  assert(resLocals.submission, 'submission is missing');

  const auto_points = resLocals.instance_question.auto_points ?? 0;
  const manual_points = resLocals.instance_question.manual_points ?? 0;
  const points = resLocals.instance_question.points ?? 0;

  const graderGuidelines = rubric_data?.rubric.grader_guidelines;
  const mustacheParams = {
    correct_answers: resLocals.submission.true_answer ?? {},
    params: resLocals.submission.params ?? {},
    submitted_answers: resLocals.submission.submitted_answer,
  };
  const graderGuidelinesRendered = graderGuidelines
    ? markdownToHtml(mustache.render(graderGuidelines, mustacheParams), { inline: true }).toString()
    : null;

  const lastGraderName = lastGrader?.name ?? lastGrader?.uid ?? 'an unknown grader';

  const openIssues = resLocals.issues
    .filter((issue) => issue.open)
    .map((issue) => ({ id: issue.id, open: issue.open }));

  // Users are only assigned to grade submissions if they have edit permissions.
  const effectiveShowSubmissionsAssignedToMeOnly = !resLocals.authz_data
    .has_course_instance_permission_edit
    ? false
    : showSubmissionsAssignedToMeOnly;

  // Pre-render HTML panels that are too complex for React conversion.
  const questionContainerHtml = QuestionContainer({
    resLocals,
    questionContext: 'manual_grading',
    showFooter: false,
    aiGradingInfo,
  }).toString();

  const personalNotesPanelHtml =
    resLocals.file_list.length > 0
      ? PersonalNotesPanel({
          fileList: resLocals.file_list,
          context: 'question',
          courseInstanceId: resLocals.course_instance.id,
          assessment_instance: resLocals.assessment_instance,
          authz_result: resLocals.authz_result,
          variantId: resLocals.variant.id,
          csrfToken: resLocals.__csrf_token,
          allowNewUploads: false,
        }).toString()
      : '';

  const instructorInfoPanelHtml = InstructorInfoPanel({
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
  }).toString();

  // Build initialPageData matching the tRPC pageData query return shape.
  const initialPageData = {
    rubricData: rubric_data,
    modifiedAt: resLocals.instance_question.modified_at.toISOString(),
    aiGradingStats,
    assessmentQuestion: StaffAssessmentQuestionSchema.parse(resLocals.assessment_question),
    rubricSettingsContext: {
      course_short_name: resLocals.course.short_name,
      course_instance_short_name: resLocals.course_instance.short_name,
      assessment_tid: resLocals.assessment.tid,
      question_qid: resLocals.question.qid,
      variant_params: resLocals.variant.params,
      variant_true_answer: resLocals.variant.true_answer,
      submission_submitted_answer: resLocals.submission.submitted_answer,
    },
    submissionId: resLocals.submission.id,
    instanceQuestionId: resLocals.instance_question.id,
    maxAutoPoints: resLocals.assessment_question.max_auto_points ?? 0,
    maxManualPoints: resLocals.assessment_question.max_manual_points ?? 0,
    maxPoints: resLocals.assessment_question.max_points ?? 0,
    autoPoints: auto_points,
    manualPoints: manual_points,
    totalPoints: points,
    submissionFeedback:
      (resLocals.submission.feedback as Record<string, any> | null)?.manual ?? null,
    rubricGrading: resLocals.submission.rubric_grading
      ? {
          adjust_points: resLocals.submission.rubric_grading.adjust_points,
          rubric_items: resLocals.submission.rubric_grading.rubric_items,
        }
      : null,
    openIssues,
    graders: graders?.map((g) => StaffUserSchema.parse(g)) ?? null,
    aiGradingInfo,
    hasEditPermission: resLocals.authz_data.has_course_instance_permission_edit,
    showInstanceQuestionGroup: instanceQuestionGroupsExist && aiGradingMode,
    selectedInstanceQuestionGroup: selectedInstanceQuestionGroup
      ? StaffInstanceQuestionGroupSchema.parse(selectedInstanceQuestionGroup)
      : null,
    instanceQuestionGroups: (instanceQuestionGroups ?? []).map((g) =>
      StaffInstanceQuestionGroupSchema.parse(g),
    ),
    graderGuidelinesRendered,
    conflictGradingJob: conflict_grading_job
      ? {
          grader_name: conflict_grading_job.grader_name,
          auto_points: conflict_grading_job.auto_points,
          manual_points: conflict_grading_job.manual_points,
          score: conflict_grading_job.score,
          feedback: conflict_grading_job.feedback,
        }
      : null,
    conflictGradingJobDateFormatted: conflict_grading_job?.date
      ? formatDateYMDHM(conflict_grading_job.date, resLocals.course_instance.display_timezone)
      : null,
    conflictLastGraderName: lastGraderName,
    existingDateFormatted: formatDateYMDHM(
      resLocals.instance_question.modified_at,
      resLocals.course_instance.display_timezone,
    ),
    displayTimezone: resLocals.course_instance.display_timezone,
    hasNon100CreditSubmissions: submissionCredits.some((credit) => credit !== 100),
    effectiveShowSubmissionsAssignedToMeOnly,
  };

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
    `,
    content: html`
      ${hydrateHtml(
        <ManualGradingInstanceQuestionPage
          initialPageData={initialPageData}
          trpcCsrfToken={trpcCsrfToken}
          csrfToken={__csrf_token}
          hasCourseInstancePermissionEdit={
            resLocals.authz_data.has_course_instance_permission_edit
          }
          assessmentInstanceOpen={resLocals.assessment_instance.open ?? false}
          breadcrumb={{
            urlPrefix: resLocals.urlPrefix,
            assessmentId: resLocals.assessment.id,
            assessmentQuestionId: resLocals.assessment_question.id,
            questionNumber: resLocals.assessment_question.number_in_alternative_group ?? 0,
            questionTitle: resLocals.question.title ?? '',
          }}
          aiGradingEnabled={aiGradingEnabled}
          aiGradingMode={aiGradingMode}
          skipGradedSubmissions={skipGradedSubmissions}
          showSubmissionsAssignedToMeOnly={showSubmissionsAssignedToMeOnly}
          questionContainerHtml={questionContainerHtml}
          personalNotesPanelHtml={personalNotesPanelHtml}
          instructorInfoPanelHtml={instructorInfoPanelHtml}
        />,
      )}
    `,
  });
}
