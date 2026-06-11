import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { AIGradingExplanation, AIGradingPrompt } from '../../../components/QuestionContainer.js';
import { getAvailableAiGradingProviders } from '../../../ee/lib/ai-grading/ai-grading-credentials.js';
import { computeAiGradingRelativeCosts } from '../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { calculateAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  buildAiGradingInfo,
  toggleAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import {
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroup,
  selectInstanceQuestionGroups,
  updateManualInstanceQuestionGroup,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { updateAssessmentInstancesScorePercPending } from '../../../lib/assessment-grading.js';
import { getAiGradingSettingsUrl, getAssessmentQuestionTrpcUrl } from '../../../lib/client/url.js';
import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { generateJobSequenceToken } from '../../../lib/generateJobSequenceToken.js';
import { idsEqual } from '../../../lib/id.js';
import { reportIssueFromForm } from '../../../lib/issues.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../../lib/question-render.js';
import type { ResLocalsInstanceQuestionRender } from '../../../lib/question-render.types.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import { getOngoingJobSequenceIds } from '../../../lib/server-jobs.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectUserById } from '../../../models/user.js';
import { selectAndAuthzVariant } from '../../../models/variant.js';

import { GradingPanel } from './gradingPanel.html.js';
import {
  type GradingJobData,
  GradingJobDataSchema,
  InstanceQuestion as InstanceQuestionPage,
} from './instanceQuestion.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function computeUseInstanceQuestionGroups(resLocals: Record<string, any>): Promise<boolean> {
  const groupingAvailable =
    (await features.enabledFromLocals('ai-submission-grouping', resLocals)) &&
    resLocals.assessment_question.ai_grading_mode;
  if (!groupingAvailable) return false;
  return await selectAssessmentQuestionHasInstanceQuestionGroups({
    assessmentQuestionId: resLocals.assessment_question.id,
  });
}

async function prepareLocalsForRender(
  query: Record<string, any>,
  resLocals: ResLocalsForPage<'instructor-instance-question'> & ResLocalsInstanceQuestionRender,
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
  await getAndRenderVariant(variant_with_submission_id, null, resLocals, {
    questionRenderContext: 'manual_grading',
  });

  let conflict_grading_job: GradingJobData | null = null;
  if (query.conflict_grading_job_id) {
    conflict_grading_job = await sqldb.queryOptionalRow(
      sql.select_grading_job_data,
      {
        grading_job_id: IdSchema.parse(query.conflict_grading_job_id),
        instance_question_id: resLocals.instance_question.id, // for authz
      },
      GradingJobDataSchema,
    );
    if (conflict_grading_job != null) {
      await manualGrading.populateManualGradingData(conflict_grading_job);
    }
  }

  const graders = await selectCourseInstanceGraderStaff({
    courseInstance: resLocals.course_instance,
  });
  return { resLocals, conflict_grading_job, graders };
}

/**
 * Loads the data shared by the main instance-question page render and the
 * `/grading_rubric_panels` partial render: feature-flag state, submission
 * grouping context, AI grading info, and the latest human grader.
 */
async function loadSharedInstanceQuestionData(
  resLocals: ResLocalsForPage<'instructor-instance-question'> & ResLocalsInstanceQuestionRender,
) {
  const aiGradingEnabled = await features.enabledFromLocals('ai-grading', resLocals);
  const aiSubmissionGroupingEnabled = await features.enabledFromLocals(
    'ai-submission-grouping',
    resLocals,
  );
  const aiGradingMode = aiGradingEnabled && resLocals.assessment_question.ai_grading_mode;

  const instance_question = resLocals.instance_question;
  const instanceQuestionGroup = await run(async () => {
    if (!aiSubmissionGroupingEnabled) return null;
    if (instance_question.manual_instance_question_group_id) {
      return await selectInstanceQuestionGroup(instance_question.manual_instance_question_group_id);
    } else if (instance_question.ai_instance_question_group_id) {
      return await selectInstanceQuestionGroup(instance_question.ai_instance_question_group_id);
    }
    return null;
  });

  const instanceQuestionGroups = aiSubmissionGroupingEnabled
    ? await selectInstanceQuestionGroups({
        assessmentQuestionId: resLocals.assessment_question.id,
      })
    : [];

  const lastHumanGraderRow = resLocals.instance_question.last_grader
    ? await sqldb.queryOptionalRow(
        sql.select_last_manual_grader_for_instance_question,
        { instance_question_id: resLocals.instance_question.id },
        z.object({ grader_name: z.string() }),
      )
    : null;

  return {
    aiGradingEnabled,
    aiSubmissionGroupingEnabled,
    aiGradingMode,
    instanceQuestionGroup,
    instanceQuestionGroups,
    lastHumanGraderName: lastHumanGraderRow?.grader_name ?? null,
  };
}

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'instructor-instance-question', ResLocalsInstanceQuestionRender>(
    async (req, res) => {
      const assignedGrader = res.locals.instance_question.assigned_grader
        ? await selectUserById(res.locals.instance_question.assigned_grader)
        : null;
      // `last_grader` records whoever last graded — manual or AI. When it's
      // null nobody has graded, so we can skip the "last manual grader" lookup
      // entirely (the query filters by grading_method = 'Manual').
      const lastGrader = res.locals.instance_question.last_grader
        ? await selectUserById(res.locals.instance_question.last_grader)
        : null;

      const shared = await loadSharedInstanceQuestionData(res.locals);
      const localsForRender = await prepareLocalsForRender(req.query, res.locals);

      const aiGradingInfo = shared.aiGradingEnabled
        ? ((await buildAiGradingInfo({
            submission_id: res.locals.submission!.id,
            submissionHtmls: localsForRender.resLocals.submissionHtmls,
          })) ?? undefined)
        : undefined;

      req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;
      req.session.show_submissions_assigned_to_me_only =
        req.session.show_submissions_assigned_to_me_only ?? true;

      const submissionCredits = await sqldb.queryScalars(
        sql.select_submission_credit_values,
        { assessment_instance_id: res.locals.assessment_instance.id },
        z.number(),
      );

      const instanceQuestionAiGradeProps = await run(async () => {
        if (!shared.aiGradingMode) return null;

        const trpcCsrfToken = generatePrefixCsrfToken(
          {
            url: getAssessmentQuestionTrpcUrl({
              courseInstanceId: res.locals.course_instance.id,
              assessmentId: res.locals.assessment.id,
              assessmentQuestionId: res.locals.assessment_question.id,
            }),
            authn_user_id: res.locals.authn_user.id,
          },
          config.secretKey,
        );

        const ongoingJobSequenceIds = await getOngoingJobSequenceIds({
          assessment_question_id: res.locals.assessment_question.id,
          type: 'ai_grading',
        });

        const initialOngoingJobSequenceTokens = ongoingJobSequenceIds.reduce<
          Record<string, string>
        >((acc, jobSequenceId) => {
          acc[jobSequenceId] = generateJobSequenceToken(jobSequenceId);
          return acc;
        }, {});

        return {
          courseInstanceId: res.locals.course_instance.id,
          assessmentId: res.locals.assessment.id,
          assessmentQuestionId: res.locals.assessment_question.id,
          instanceQuestionId: res.locals.instance_question.id,
          trpcCsrfToken,
          isDevMode: process.env.NODE_ENV === 'development',
          hasRubric: res.locals.assessment_question.manual_rubric_id != null,
          useCustomApiKeys: res.locals.course_instance.ai_grading_use_custom_api_keys,
          aiGradingSettingsUrl: getAiGradingSettingsUrl(res.locals.course_instance.id),
          availableAiGradingProviders: await getAvailableAiGradingProviders(
            res.locals.course_instance,
          ),
          aiGradingRelativeCosts: computeAiGradingRelativeCosts(config.costPerMillionTokens),
          aiGradingLastSelectedModel:
            res.locals.assessment_question.ai_grading_last_selected_model ?? null,
          initialOngoingJobSequenceTokens,
          hasCourseInstancePermissionEdit:
            res.locals.authz_data.has_course_instance_permission_edit,
        };
      });

      res.send(
        InstanceQuestionPage({
          ...localsForRender,
          assignedGrader,
          lastGrader,
          lastHumanGraderName: shared.lastHumanGraderName,
          selectedInstanceQuestionGroup: shared.instanceQuestionGroup,
          instanceQuestionGroups: shared.instanceQuestionGroups,
          aiGradingEnabled: shared.aiGradingEnabled,
          aiGradingMode: shared.aiGradingMode,
          aiGradingInfo,
          aiGradingStats: shared.aiGradingMode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
          skipGradedSubmissions: req.session.skip_graded_submissions,
          showSubmissionsAssignedToMeOnly: req.session.show_submissions_assigned_to_me_only,
          submissionCredits,
          instanceQuestionAiGradeProps,
        }),
      );
    },
  ),
);

router.put(
  '/manual_instance_question_group',
  asyncHandler(async (req, res) => {
    const aiSubmissionGroupingEnabled = await features.enabledFromLocals(
      'ai-submission-grouping',
      res.locals,
    );
    if (!aiSubmissionGroupingEnabled) {
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
      course: res.locals.course,
      question: res.locals.question,
      instance_question: res.locals.instance_question,
      variant,
      user: res.locals.user,
      authn_user: res.locals.authn_user,
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
  typedAsyncHandler<'instructor-instance-question', ResLocalsInstanceQuestionRender>(
    async (req, res) => {
      try {
        const shared = await loadSharedInstanceQuestionData(res.locals);
        const locals = await prepareLocalsForRender({}, res.locals);
        const rubric_data = await manualGrading.selectRubricData({
          assessment_question: res.locals.assessment_question,
        });

        // `prepareLocalsForRender` guarantees a submission exists.
        const submission = res.locals.submission!;
        const panels = await renderPanelsForSubmission({
          unsafe_submission_id: submission.id,
          course: res.locals.course,
          question: res.locals.question,
          instance_question: res.locals.instance_question,
          variant: res.locals.variant,
          user: res.locals.user,
          authn_user: res.locals.authn_user,
          urlPrefix: res.locals.urlPrefix,
          questionContext: 'manual_grading',
          questionRenderContext: 'manual_grading',
          authorizedEdit: false,
          renderScorePanels: false,
          groupRolePermissions: null,
        });

        const aiGradingInfo = shared.aiGradingEnabled
          ? ((await buildAiGradingInfo({
              submission_id: submission.id,
              submissionHtmls: res.locals.submissionHtmls,
            })) ?? undefined)
          : undefined;

        const gradingPanel = GradingPanel({
          ...locals,
          context: 'main',
          aiGradingInfo,
          aiGradingMode: shared.aiGradingMode,
          selectedInstanceQuestionGroup: shared.instanceQuestionGroup,
          showInstanceQuestionGroup:
            shared.instanceQuestionGroups.length > 0 && shared.aiGradingMode,
          instanceQuestionGroups: shared.instanceQuestionGroups,
          skip_graded_submissions: req.session.skip_graded_submissions ?? true,
          show_submissions_assigned_to_me_only:
            req.session.show_submissions_assigned_to_me_only ?? true,
          gradedByHumanName: shared.lastHumanGraderName,
        }).toString();

        const aiGradingExplanation = aiGradingInfo
          ? AIGradingExplanation({
              explanation: aiGradingInfo.explanation,
              hasImage: aiGradingInfo.hasImage,
              rotationCorrectionDegrees: aiGradingInfo.rotationCorrectionDegrees,
            }).toString()
          : '';

        const aiGradingPrompt = aiGradingInfo?.prompt
          ? AIGradingPrompt({ prompt: aiGradingInfo.prompt }).toString()
          : '';

        res.json({
          gradingPanel,
          aiGradingExplanation,
          aiGradingPrompt,
          rubric_data,
          submissionPanel: panels.submissionPanel,
          submissionId: submission.id,
          aiGradingStats: shared.aiGradingMode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
        });
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    },
  ),
);

const PostBodySchema = z.union([
  z.object({
    __action: z.enum([
      'add_manual_grade',
      'add_manual_grade_for_instance_question_group',
      'add_manual_grade_for_instance_question_group_ungraded',
      'next_instance_question',
    ]),
    submission_id: IdSchema,
    modified_at: DateFromISOString,
    rubric_item_selected_manual: IdSchema.or(z.array(IdSchema))
      .nullish()
      .transform((val) =>
        val == null ? [] : typeof val === 'string' ? [val] : Object.values(val),
      ),
    score_manual_adjust_points: z.coerce.number().nullish(),
    use_score_perc: z.literal('on').optional(),
    score_manual_points: z.coerce.number().nullish(),
    score_manual_percent: z.coerce.number().nullish(),
    score_auto_points: z.coerce.number().nullish(),
    score_auto_percent: z.coerce.number().nullish(),
    submission_note: z.string().nullish(),
    unsafe_issue_ids_close: IdSchema.or(z.array(IdSchema))
      .nullish()
      .transform((val) =>
        val == null ? [] : typeof val === 'string' ? [val] : Object.values(val),
      ),
    skip_graded_submissions: z.preprocess((val) => val === 'true', z.boolean()),
    show_submissions_assigned_to_me_only: z.preprocess((val) => val === 'true', z.boolean()),
  }),
  z.object({
    __action: z.literal('modify_rubric_settings'),
    use_rubric: z.boolean(),
    replace_auto_points: z.boolean(),
    starting_points: z.coerce.number(),
    min_points: z.coerce.number(),
    max_extra_points: z.coerce.number(),
    tag_for_manual_grading: z.boolean().default(false),
    grader_guidelines: z.string().nullable(),
    rubric_items: z
      .array(
        z.object({
          id: z.string().optional(),
          order: z.coerce.number(),
          points: z.coerce.number(),
          description: z.string(),
          explanation: z.string().nullable().optional(),
          grader_note: z.string().nullable().optional(),
          always_show_to_students: z.boolean(),
        }),
      )
      .default([]),
  }),
  z.object({
    __action: z.custom<`reassign_${string}`>(
      (val) => typeof val === 'string' && val.startsWith('reassign_'),
    ),
    skip_graded_submissions: z.preprocess((val) => val === 'true', z.boolean()),
    show_submissions_assigned_to_me_only: z.preprocess((val) => val === 'true', z.boolean()),
  }),
  z.object({
    __action: z.literal('report_issue'),
    __variant_id: IdSchema,
    description: z.string(),
  }),
  z.object({
    __action: z.literal('toggle_ai_grading_mode'),
  }),
]);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = PostBodySchema.parse(req.body);
    if (body.__action === 'next_instance_question') {
      if (!res.locals.authz_data.has_course_instance_permission_view) {
        throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
      }
    } else if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    if (body.__action === 'add_manual_grade') {
      req.session.skip_graded_submissions = body.skip_graded_submissions;
      req.session.show_submissions_assigned_to_me_only = body.show_submissions_assigned_to_me_only;

      const manual_rubric_data = res.locals.assessment_question.manual_rubric_id
        ? {
            rubric_id: res.locals.assessment_question.manual_rubric_id,
            applied_rubric_items: body.rubric_item_selected_manual.map((id) => ({
              rubric_item_id: id,
            })),
            adjust_points: body.score_manual_adjust_points || null,
          }
        : undefined;
      const { modified_at_conflict, grading_job_id } =
        await manualGrading.updateInstanceQuestionScore({
          assessment: res.locals.assessment,
          instance_question_id: res.locals.instance_question.id,
          submission_id: body.submission_id,
          check_modified_at: body.modified_at,
          score: {
            manual_score_perc: body.use_score_perc ? body.score_manual_percent : null,
            manual_points: body.use_score_perc ? null : body.score_manual_points,
            auto_score_perc: body.use_score_perc ? body.score_auto_percent : null,
            auto_points: body.use_score_perc ? null : body.score_auto_points,
            feedback: { manual: body.submission_note },
            manual_rubric_data,
          },
          authn_user_id: res.locals.authn_user.id,
        });

      if (modified_at_conflict) {
        return res.redirect(req.baseUrl + `?conflict_grading_job_id=${grading_job_id}`);
      }
      // Only close issues if the submission was successfully graded
      if (body.unsafe_issue_ids_close.length > 0) {
        await sqldb.execute(sql.close_issues_for_instance_question, {
          issue_ids: body.unsafe_issue_ids_close,
          instance_question_id: res.locals.instance_question.id,
          authn_user_id: res.locals.authn_user.id,
        });
      }

      const use_instance_question_groups = await computeUseInstanceQuestionGroups(res.locals);

      res.redirect(
        await manualGrading.nextInstanceQuestionUrl({
          urlPrefix: res.locals.urlPrefix,
          assessment_id: res.locals.assessment.id,
          assessment_question_id: res.locals.assessment_question.id,
          user_id: res.locals.authz_data.user.id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          show_submissions_assigned_to_me_only: req.session.show_submissions_assigned_to_me_only,
          use_instance_question_groups,
        }),
      );
    } else if (body.__action === 'next_instance_question') {
      req.session.skip_graded_submissions = body.skip_graded_submissions;
      req.session.show_submissions_assigned_to_me_only = body.show_submissions_assigned_to_me_only;

      const use_instance_question_groups = await computeUseInstanceQuestionGroups(res.locals);

      res.redirect(
        await manualGrading.nextInstanceQuestionUrl({
          urlPrefix: res.locals.urlPrefix,
          assessment_id: res.locals.assessment.id,
          assessment_question_id: res.locals.assessment_question.id,
          user_id: res.locals.authz_data.user.id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          show_submissions_assigned_to_me_only: req.session.show_submissions_assigned_to_me_only,
          use_instance_question_groups,
        }),
      );
    } else if (
      body.__action === 'add_manual_grade_for_instance_question_group_ungraded' ||
      body.__action === 'add_manual_grade_for_instance_question_group'
    ) {
      req.session.skip_graded_submissions = body.skip_graded_submissions;
      req.session.show_submissions_assigned_to_me_only = body.show_submissions_assigned_to_me_only;

      const aiSubmissionGroupingEnabled = await features.enabledFromLocals(
        'ai-submission-grouping',
        res.locals,
      );

      if (!aiSubmissionGroupingEnabled) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const useInstanceQuestionGroups = await run(async () => {
        if (!res.locals.assessment_question.ai_grading_mode) {
          return false;
        }
        return await selectAssessmentQuestionHasInstanceQuestionGroups({
          assessmentQuestionId: res.locals.assessment_question.id,
        });
      });

      if (!useInstanceQuestionGroups) {
        // This should not happen, since the UI only lets users grade by instance question group if
        // instance question groups were previously generated.
        throw new error.HttpStatusError(400, 'Submission groups not generated.');
      }

      const selected_instance_question_group_id =
        res.locals.instance_question.manual_instance_question_group_id ||
        res.locals.instance_question.ai_instance_question_group_id;

      if (!selected_instance_question_group_id) {
        throw new error.HttpStatusError(404, 'Selected instance question group not found');
      }

      const instanceQuestionsInGroup = await sqldb.queryRows(
        sql.select_instance_question_ids_in_group,
        {
          selected_instance_question_group_id,
          assessment_id: res.locals.assessment.id,
          skip_graded_submissions:
            body.__action === 'add_manual_grade_for_instance_question_group_ungraded',
        },
        z.object({
          instance_question_id: z.string(),
          submission_id: z.string(),
        }),
      );

      if (instanceQuestionsInGroup.length === 0) {
        flash(
          'warning',
          `No ${body.__action === 'add_manual_grade_for_instance_question_group_ungraded' ? 'ungraded ' : ''}instance questions in the submission group.`,
        );
        return res.redirect(req.baseUrl);
      }

      const manual_rubric_data = res.locals.assessment_question.manual_rubric_id
        ? {
            rubric_id: res.locals.assessment_question.manual_rubric_id,
            applied_rubric_items: body.rubric_item_selected_manual.map((id) => ({
              rubric_item_id: id,
            })),
            adjust_points: body.score_manual_adjust_points || null,
          }
        : undefined;

      for (const instanceQuestion of instanceQuestionsInGroup) {
        const { modified_at_conflict } = await manualGrading.updateInstanceQuestionScore({
          assessment: res.locals.assessment,
          instance_question_id: instanceQuestion.instance_question_id,
          submission_id: instanceQuestion.submission_id,
          check_modified_at: null,
          score: {
            manual_score_perc: body.use_score_perc ? body.score_manual_percent : null,
            manual_points: body.use_score_perc ? null : body.score_manual_points,
            auto_score_perc: body.use_score_perc ? body.score_auto_percent : null,
            auto_points: body.use_score_perc ? null : body.score_auto_points,
            feedback: { manual: body.submission_note },
            manual_rubric_data,
          },
          authn_user_id: res.locals.authn_user.id,
        });

        if (modified_at_conflict) {
          flash('error', 'A conflict occurred while grading the submission. Please try again.');
          return res.redirect(req.baseUrl);
        }
      }

      flash(
        'success',
        `Successfully applied grade and feedback to ${instanceQuestionsInGroup.length} instance questions.`,
      );

      res.redirect(
        await manualGrading.nextInstanceQuestionUrl({
          urlPrefix: res.locals.urlPrefix,
          assessment_id: res.locals.assessment.id,
          assessment_question_id: res.locals.assessment_question.id,
          user_id: res.locals.authz_data.user.id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          show_submissions_assigned_to_me_only: req.session.show_submissions_assigned_to_me_only,
          use_instance_question_groups: true,
        }),
      );
    } else if (body.__action === 'modify_rubric_settings') {
      try {
        await manualGrading.updateAssessmentQuestionRubric({
          assessment: res.locals.assessment,
          assessment_question_id: res.locals.instance_question.assessment_question_id,
          use_rubric: body.use_rubric,
          replace_auto_points: body.replace_auto_points,
          starting_points: body.starting_points,
          min_points: body.min_points,
          max_extra_points: body.max_extra_points,
          rubric_items: body.rubric_items,
          tag_for_manual_grading: body.tag_for_manual_grading,
          grader_guidelines: body.grader_guidelines,
          authn_user_id: res.locals.authn_user.id,
        });
        res.redirect(req.baseUrl + '/grading_rubric_panels');
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    } else if (body.__action === 'report_issue') {
      await reportIssueFromForm(req, res);
      res.redirect(req.originalUrl);
    } else if (body.__action === 'toggle_ai_grading_mode') {
      await toggleAiGradingMode(res.locals.assessment_question.id);
      res.redirect(req.originalUrl);
    } else if (typeof body.__action === 'string' && body.__action.startsWith('reassign_')) {
      const actionPrompt = body.__action.slice(9);
      const assigned_grader = ['nobody', 'graded'].includes(actionPrompt) ? null : actionPrompt;
      const requires_manual_grading = actionPrompt !== 'graded';
      const recomputePending =
        res.locals.instance_question.requires_manual_grading !== requires_manual_grading;
      if (assigned_grader != null) {
        const courseStaff = await selectCourseInstanceGraderStaff({
          courseInstance: res.locals.course_instance,
        });
        if (!courseStaff.some((staff) => idsEqual(staff.id, assigned_grader))) {
          throw new error.HttpStatusError(
            400,
            'The assigned grader does not have student data editor permissions.',
          );
        }
      }
      await sqldb.execute(sql.update_assigned_grader, {
        instance_question_id: res.locals.instance_question.id,
        assigned_grader,
        requires_manual_grading,
      });
      if (recomputePending) {
        await updateAssessmentInstancesScorePercPending([res.locals.assessment_instance.id]);
      }

      const use_instance_question_groups = await computeUseInstanceQuestionGroups(res.locals);

      req.session.skip_graded_submissions = body.skip_graded_submissions;
      req.session.show_submissions_assigned_to_me_only = body.show_submissions_assigned_to_me_only;

      res.redirect(
        await manualGrading.nextInstanceQuestionUrl({
          urlPrefix: res.locals.urlPrefix,
          assessment_id: res.locals.assessment.id,
          assessment_question_id: res.locals.assessment_question.id,
          user_id: res.locals.authz_data.user.id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          show_submissions_assigned_to_me_only: req.session.show_submissions_assigned_to_me_only,
          use_instance_question_groups,
        }),
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
