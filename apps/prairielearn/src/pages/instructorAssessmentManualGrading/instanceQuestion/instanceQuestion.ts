import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { calculateAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  selectLastSubmissionId,
  selectRubricGradingItems,
  toggleAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import type { InstanceQuestionAIGradingInfo } from '../../../ee/lib/ai-grading/types.js';
import {
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroup,
  selectInstanceQuestionGroups,
  updateManualInstanceQuestionGroup,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { AiGradingJobSchema, GradingJobSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { reportIssueFromForm } from '../../../lib/issues.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { formatJsonWithPrettier } from '../../../lib/prettier.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../../lib/question-render.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
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

async function prepareLocalsForRender(
  query: Record<string, any>,
  resLocals: ResLocalsForPage<'instructor-instance-question'>,
) {
  // Even though getAndRenderVariant will select variants for the instance question, if the
  // question has multiple variants, by default getAndRenderVariant may select a variant without
  // submissions or even create a new one. We don't want that behavior, so we select the last
  // submission and pass it along to getAndRenderVariant explicitly.
  const variant_with_submission_id = await sqldb.queryOptionalRow(
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
    authzData: resLocals.authz_data,
    requiredRole: ['Student Data Viewer'],
  });
  return { resLocals, conflict_grading_job, graders };
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

    /**
     * Contains the prompt and selected rubric items of the AI grader.
     * If the submission was not graded by AI, this will be undefined.
     */
    let aiGradingInfo: InstanceQuestionAIGradingInfo | undefined = undefined;

    if (aiGradingEnabled) {
      const submission_id = await selectLastSubmissionId(instance_question.id);
      const ai_grading_job_data = await sqldb.queryOptionalRow(
        sql.select_ai_grading_job_data_for_submission,
        {
          submission_id,
        },
        z.object({
          id: GradingJobSchema.shape.id,
          manual_rubric_grading_id: GradingJobSchema.shape.manual_rubric_grading_id,
          prompt: AiGradingJobSchema.shape.prompt,
          completion: AiGradingJobSchema.shape.completion,
          rotation_correction_degrees: AiGradingJobSchema.shape.rotation_correction_degrees,
        }),
      );

      if (ai_grading_job_data) {
        const promptForGradingJob = ai_grading_job_data.prompt;
        const selectedRubricItems = await selectRubricGradingItems(
          ai_grading_job_data.manual_rubric_grading_id,
        );

        /** The submission was also manually graded if a manual grading job exists for it.*/
        const submissionManuallyGraded =
          (await sqldb.queryOptionalRow(
            sql.select_exists_manual_grading_job_for_submission,
            { submission_id },
            z.boolean(),
          )) ?? false;

        const formattedPrompt =
          promptForGradingJob !== null
            ? (await formatJsonWithPrettier(JSON.stringify(promptForGradingJob, null, 2)))
                .replaceAll('\\n', '\n')
                .trimStart()
            : '';

        // We're dealing with a schemaless JSON blob here. We'll be defensive and
        // try to avoid errors when extracting the explanation. Note that for some
        // time, the explanation wasn't included in the completion at all, so it
        // may legitimately be missing.
        //
        // Over the lifetime of this feature, we've changed which APIs/libraries we
        // use to generate the completion, so we need to handle all formats we've ever
        // used for backwards-compatibility. Each one is documented below.
        const explanation = run(() => {
          const completion = ai_grading_job_data.completion;
          if (!completion) return null;

          // OpenAI chat completion format
          if (completion.choices) {
            const explanation = completion?.choices?.[0]?.message?.parsed?.explanation;
            if (typeof explanation !== 'string') return null;

            return explanation.trim() || null;
          }

          // OpenAI response format
          if (completion.output_parsed) {
            const explanation = completion?.output_parsed?.explanation;
            if (typeof explanation !== 'string') return null;

            return explanation.trim() || null;
          }

          // `ai` package format
          if (completion.object) {
            const explanation = completion?.object?.explanation;
            if (typeof explanation !== 'string') return null;

            return explanation.trim() || null;
          }

          return null;
        });

        aiGradingInfo = {
          submissionManuallyGraded,
          prompt: formattedPrompt,
          selectedRubricItemIds: selectedRubricItems.map((item) => item.id),
          explanation,
          rotationCorrectionDegrees: ai_grading_job_data.rotation_correction_degrees
            ? JSON.stringify(ai_grading_job_data.rotation_correction_degrees)
            : null,
        };
      }
    }

    req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;
    req.session.show_submissions_assigned_to_me_only =
      req.session.show_submissions_assigned_to_me_only ?? true;

    const submissionCredits = await sqldb.queryRows(
      sql.select_submission_credit_values,
      { assessment_instance_id: res.locals.assessment_instance.id },
      z.number(),
    );

    res.send(
      InstanceQuestionPage({
        ...(await prepareLocalsForRender(req.query, res.locals)),
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
      }),
    );
  }),
);

router.put(
  '/manual_instance_question_group',
  asyncHandler(async (req, res) => {
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
    try {
      const locals = await prepareLocalsForRender({}, res.locals);
      const rubric_data = await manualGrading.selectRubricData({
        assessment_question: res.locals.assessment_question,
      });
      const gradingPanel = GradingPanel({
        ...locals,
        context: 'main',
      }).toString();
      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);

      // `prepareLocalsForRender` guarantees a submission exists.
      const submission = res.locals.submission!;
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
        gradingPanel,
        rubric_data,
        submissionPanel: panels.submissionPanel,
        submissionId: submission.id,
        aiGradingStats:
          aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
      });
    } catch (err) {
      res.send({ err: String(err) });
    }
  }),
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

      const use_instance_question_groups = await run(async () => {
        const aiGradingMode =
          (await features.enabledFromLocals('ai-grading', res.locals)) &&
          res.locals.assessment_question.ai_grading_mode;
        if (!aiGradingMode) {
          return false;
        }
        return await selectAssessmentQuestionHasInstanceQuestionGroups({
          assessmentQuestionId: res.locals.assessment_question.id,
        });
      });

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

      const use_instance_question_groups = await run(async () => {
        const aiGradingMode =
          (await features.enabledFromLocals('ai-grading', res.locals)) &&
          res.locals.assessment_question.ai_grading_mode;
        if (!aiGradingMode) {
          return false;
        }
        return await selectAssessmentQuestionHasInstanceQuestionGroups({
          assessmentQuestionId: res.locals.assessment_question.id,
        });
      });

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

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);

      if (!aiGradingEnabled) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const useInstanceQuestionGroups = await run(async () => {
        const aiGradingMode =
          (await features.enabledFromLocals('ai-grading', res.locals)) &&
          res.locals.assessment_question.ai_grading_mode;
        if (!aiGradingMode) {
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
      if (assigned_grader != null) {
        const courseStaff = await selectCourseInstanceGraderStaff({
          courseInstance: res.locals.course_instance,
          authzData: res.locals.authz_data,
          requiredRole: ['Student Data Editor'],
        });
        if (!courseStaff.some((staff) => idsEqual(staff.id, assigned_grader))) {
          throw new error.HttpStatusError(
            400,
            'Assigned grader does not have Student Data Editor permission',
          );
        }
      }
      await sqldb.execute(sql.update_assigned_grader, {
        instance_question_id: res.locals.instance_question.id,
        assigned_grader,
        requires_manual_grading: actionPrompt !== 'graded',
      });

      req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;
      req.session.show_submissions_assigned_to_me_only =
        req.session.show_submissions_assigned_to_me_only ?? true;

      const use_instance_question_groups = await run(async () => {
        const aiGradingMode =
          (await features.enabledFromLocals('ai-grading', res.locals)) &&
          res.locals.assessment_question.ai_grading_mode;
        if (!aiGradingMode) {
          return false;
        }
        return await selectAssessmentQuestionHasInstanceQuestionGroups({
          assessmentQuestionId: res.locals.assessment_question.id,
        });
      });

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
