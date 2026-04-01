import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { calculateAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { containsImageCapture } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import {
  selectInstanceQuestionGroup,
  selectInstanceQuestionGroups,
  updateManualInstanceQuestionGroup,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { getInstanceQuestionTrpcUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { reportIssueFromForm } from '../../../lib/issues.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../../lib/question-render.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectUserById } from '../../../models/user.js';
import { selectAndAuthzVariant } from '../../../models/variant.js';

import { InstanceQuestion as InstanceQuestionPage } from './instanceQuestion.html.js';
import {
  type GradingJobData,
  buildAiGradingInfo,
  fetchGradingJobData,
  fetchRubricGrading,
  fetchSubmissionCredits,
} from './queries.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const router = Router();

async function prepareLocalsForRender(
  query: Record<string, any>,
  resLocals: ResLocalsForPage<'instructor-instance-question'>,
) {
  // Even though getAndRenderVariant will select variants for the instance question, if the
  // question has multiple variants, by default getAndRenderVariant may select a variant without
  // submissions or even create a new one. We don't want that behavior, so we select the last
  // submission and pass it along to getAndRenderVariant explicitly.
  const variant_with_submission_id = await sqldb.queryOptionalScalar(
    sql.select_variant_with_last_submission,
    { instance_question_id: resLocals.instance_question.id },
    IdSchema,
  );

  // If student never loaded question or never submitted anything (submission is null)
  if (variant_with_submission_id == null) {
    throw new error.HttpStatusError(404, 'Instance question does not have a gradable submission.');
  }
  resLocals.questionRenderContext = 'manual_grading';
  await getAndRenderVariant(variant_with_submission_id, null, resLocals);

  let conflict_grading_job: GradingJobData | null = null;
  if (query.conflict_grading_job_id) {
    conflict_grading_job = await fetchGradingJobData({
      gradingJobId: IdSchema.parse(query.conflict_grading_job_id),
      instanceQuestionId: resLocals.instance_question.id,
    });
  }

  // Extract rubric grading from the conflict grading job, if present.
  const conflict_rubric_grading = conflict_grading_job?.manual_rubric_grading_id
    ? await fetchRubricGrading(conflict_grading_job.manual_rubric_grading_id)
    : null;

  const graders = await selectCourseInstanceGraderStaff({
    courseInstance: resLocals.course_instance,
    authzData: resLocals.authz_data,
    requiredRole: ['Student Data Viewer'],
  });
  return { resLocals, conflict_grading_job, conflict_rubric_grading, graders };
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'instructor-instance-question'>(async (req, res) => {
    const assignedGrader = res.locals.instance_question.assigned_grader
      ? await selectUserById(res.locals.instance_question.assigned_grader)
      : null;
    const lastGrader = res.locals.instance_question.last_grader
      ? await selectUserById(res.locals.instance_question.last_grader)
      : null;

    const instance_question = res.locals.instance_question;

    const instanceQuestionGroup = await run(async () => {
      if (instance_question.manual_instance_question_group_id) {
        return await selectInstanceQuestionGroup(
          instance_question.manual_instance_question_group_id,
        );
      } else if (instance_question.ai_instance_question_group_id) {
        return await selectInstanceQuestionGroup(instance_question.ai_instance_question_group_id);
      }
      return null;
    });

    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);

    const instanceQuestionGroups = await selectInstanceQuestionGroups({
      assessmentQuestionId: res.locals.assessment_question.id,
    });

    const localsForRender = await prepareLocalsForRender(req.query, res.locals);

    const aiGradingInfo = aiGradingEnabled
      ? await buildAiGradingInfo({
          instanceQuestionId: instance_question.id,
          submissionSubmittedAnswer: localsForRender.resLocals.submission?.submitted_answer ?? null,
          hasImageFallback: () => {
            if (localsForRender.resLocals.submissionHtmls.length > 0) {
              return containsImageCapture(localsForRender.resLocals.submissionHtmls[0]);
            }
            return false;
          },
        })
      : undefined;

    req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;
    req.session.show_submissions_assigned_to_me_only =
      req.session.show_submissions_assigned_to_me_only ?? true;

    const submissionCredits = await fetchSubmissionCredits(res.locals.assessment_instance.id);

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getInstanceQuestionTrpcUrl({
          courseInstanceId: res.locals.course_instance.id,
          instanceQuestionId: res.locals.instance_question.id,
        }),
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    res.send(
      InstanceQuestionPage({
        ...localsForRender,
        assignedGrader,
        lastGrader,
        selectedInstanceQuestionGroup: instanceQuestionGroup,
        instanceQuestionGroups,
        aiGradingEnabled,
        aiGradingMode: aiGradingEnabled && res.locals.assessment_question.ai_grading_mode,
        aiGradingInfo,
        aiGradingStats:
          aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
        skipGradedSubmissions: req.session.skip_graded_submissions,
        showSubmissionsAssignedToMeOnly: req.session.show_submissions_assigned_to_me_only,
        submissionCredits,
        trpcCsrfToken,
      }),
    );
  }),
);

router.put(
  '/manual_instance_question_group',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    if (!aiGradingEnabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }

    const manualInstanceQuestionGroupId = req.body.manualInstanceQuestionGroupId;

    await updateManualInstanceQuestionGroup({
      instance_question_id: res.locals.instance_question.id,
      manual_instance_question_group_id: manualInstanceQuestionGroupId || null,
    });

    res.sendStatus(204);
  }),
);

router.get(
  '/variant/:unsafe_variant_id(\\d+)/submission/:unsafe_submission_id(\\d+)',
  typedAsyncHandler<'instructor-instance-question'>(async (req, res) => {
    const variant = await selectAndAuthzVariant({
      unsafe_variant_id: req.params.unsafe_variant_id,
      variant_course: res.locals.course,
      question_id: res.locals.question.id,
      course_instance_id: res.locals.course_instance.id,
      instance_question_id: res.locals.instance_question.id,
      authz_data: res.locals.authz_data,
      authn_user: res.locals.authn_user,
      user: res.locals.user,
      is_administrator: res.locals.is_administrator,
    });

    const panels = await renderPanelsForSubmission({
      unsafe_submission_id: req.params.unsafe_submission_id,
      question: res.locals.question,
      instance_question: res.locals.instance_question,
      variant,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'manual_grading',
      questionRenderContext: 'manual_grading',
      // This is only used by score panels, which are not rendered in this context.
      authorizedEdit: false,
      // The score panels never need to be live-updated in this context.
      renderScorePanels: false,
      // Group role permissions are not used in this context.
      groupRolePermissions: null,
    });
    res.json(panels);
  }),
);

router.get(
  '/grading_rubric_panels',
  typedAsyncHandler<'instructor-instance-question'>(async (req, res) => {
    const locals = await prepareLocalsForRender({}, res.locals);
    const rubric_data = await manualGrading.selectRubricData({
      assessment_question: res.locals.assessment_question,
    });
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);

    // `prepareLocalsForRender` guarantees a submission exists.
    const submission = locals.resLocals.submission!;
    const panels = await renderPanelsForSubmission({
      unsafe_submission_id: submission.id,
      question: res.locals.question,
      instance_question: res.locals.instance_question,
      variant: res.locals.variant,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'manual_grading',
      questionRenderContext: 'manual_grading',
      authorizedEdit: false,
      renderScorePanels: false,
      groupRolePermissions: null,
    });

    res.json({
      rubric_data,
      submissionPanel: panels.submissionPanel,
      submissionId: submission.id,
      modifiedAt: locals.resLocals.instance_question.modified_at.toISOString(),
      aiGradingStats:
        aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
          ? await calculateAiGradingStats(res.locals.assessment_question)
          : null,
    });
  }),
);

const PostBodySchema = z.object({
  __action: z.literal('report_issue'),
  __variant_id: IdSchema,
  description: z.string(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    PostBodySchema.parse(req.body);
    await reportIssueFromForm(req, res);
    res.redirect(req.originalUrl);
  }),
);

export default router;
