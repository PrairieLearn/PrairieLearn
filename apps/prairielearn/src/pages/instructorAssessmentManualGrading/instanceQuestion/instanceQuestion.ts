import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import qs from 'qs';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

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
import {
  AiGradingJobSchema,
  DateFromISOString,
  GradingJobSchema,
  IdSchema,
  type InstanceQuestion,
} from '../../../lib/db-types.js';
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
import { RubricSettingsModal } from './rubricSettingsModal.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function prepareLocalsForRender(
  query: Record<string, any>,
  resLocals: ResLocalsForPage['instructor-instance-question'],
) {
  // Even though getAndRenderVariant will select variants for the instance question, if the
  // question has multiple variants, by default getAndRenderVariant may select a variant without
  // submissions or even create a new one. We don't want that behaviour, so we select the last
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
    course_instance_id: resLocals.course_instance.id,
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

    const instance_question = res.locals.instance_question as InstanceQuestion;

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

    if (instance_question == null) {
      throw new error.HttpStatusError(404, 'Instance question not found');
    }

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
        }),
      );

      if (ai_grading_job_data) {
        const promptForGradingJob = ai_grading_job_data.prompt as
          | ChatCompletionMessageParam[]
          | null;
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

        /** Images sent in the AI grading prompt */
        const promptImageUrls: string[] = [];

        if (promptForGradingJob) {
          for (const message of promptForGradingJob) {
            if (message.content && typeof message.content === 'object') {
              for (const part of message.content) {
                if (part.type === 'image_url') {
                  promptImageUrls.push(part.image_url.url);
                }
              }
            }
          }
        }

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
        const explanation = run(() => {
          const completion = ai_grading_job_data.completion;
          if (completion == null) return null;

          const explanation = completion?.choices?.[0]?.message?.parsed?.explanation;
          if (typeof explanation !== 'string') return null;

          return explanation.trim() || null;
        });

        aiGradingInfo = {
          submissionManuallyGraded,
          prompt: formattedPrompt,
          selectedRubricItemIds: selectedRubricItems.map((item) => item.id),
          promptImageUrls,
          explanation,
        };
      }
    }

    req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;

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
        skipGradedSubmissions: req.session.skip_graded_submissions,
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
      const gradingPanel = GradingPanel({
        ...locals,
        context: 'main',
      }).toString();
      const rubricSettings = RubricSettingsModal(locals).toString();
      res.send({ gradingPanel, rubricSettings });
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
    rubric_item_selected_manual: IdSchema.or(z.record(z.string(), IdSchema))
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
    unsafe_issue_ids_close: IdSchema.or(z.record(z.string(), IdSchema))
      .nullish()
      .transform((val) =>
        val == null ? [] : typeof val === 'string' ? [val] : Object.values(val),
      ),
    skip_graded_submissions: z.preprocess((val) => val === 'true', z.boolean()),
  }),
  z.object({
    __action: z.literal('modify_rubric_settings'),
    use_rubric: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => val === 'true'),
    replace_auto_points: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => val === 'true'),
    starting_points: z.coerce.number(),
    min_points: z.coerce.number(),
    max_extra_points: z.coerce.number(),
    tag_for_manual_grading: z
      .literal('true')
      .optional()
      .transform((val) => val === 'true'),
    rubric_item: z
      .record(
        z.string(),
        z.object({
          id: z.string().optional(),
          order: z.coerce.number(),
          points: z.coerce.number(),
          description: z.string(),
          explanation: z.string().optional(),
          grader_note: z.string().optional(),
          always_show_to_students: z.string().transform((val) => val === 'true'),
        }),
      )
      .default({}),
  }),
  z.object({
    __action: z.custom<`reassign_${string}`>(
      (val) => typeof val === 'string' && val.startsWith('reassign_'),
    ),
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
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const body = PostBodySchema.parse(
      // Parse using qs, which allows deep objects to be created based on parameter names
      // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
      // Array parsing is disabled, as it has special cases for 22+ items that
      // we don't want to double-handle, so we always receive an object and
      // convert it to an array if necessary
      // (https://github.com/ljharb/qs#parsing-arrays).
      // The order of the items in arrays is never important, so using Object.values is fine.
      qs.parse(qs.stringify(req.body), { parseArrays: false }),
    );
    if (body.__action === 'add_manual_grade') {
      req.session.skip_graded_submissions =
        body.skip_graded_submissions ?? req.session.skip_graded_submissions ?? true;

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
        await manualGrading.updateInstanceQuestionScore(
          res.locals.assessment.id,
          res.locals.instance_question.id,
          body.submission_id,
          body.modified_at, // check_modified_at
          {
            manual_score_perc: body.use_score_perc ? body.score_manual_percent : null,
            manual_points: body.use_score_perc ? null : body.score_manual_points,
            auto_score_perc: body.use_score_perc ? body.score_auto_percent : null,
            auto_points: body.use_score_perc ? null : body.score_auto_points,
            feedback: { manual: body.submission_note },
            manual_rubric_data,
          },
          res.locals.authn_user.user_id,
        );

      if (modified_at_conflict) {
        return res.redirect(req.baseUrl + `?conflict_grading_job_id=${grading_job_id}`);
      }
      // Only close issues if the submission was successfully graded
      if (body.unsafe_issue_ids_close.length > 0) {
        await sqldb.execute(sql.close_issues_for_instance_question, {
          issue_ids: body.unsafe_issue_ids_close,
          instance_question_id: res.locals.instance_question.id,
          authn_user_id: res.locals.authn_user.user_id,
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
          user_id: res.locals.authz_data.user.user_id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          use_instance_question_groups,
        }),
      );
    } else if (body.__action === 'next_instance_question') {
      req.session.skip_graded_submissions =
        body.skip_graded_submissions ?? req.session.skip_graded_submissions ?? true;

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
          user_id: res.locals.authz_data.user.user_id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          use_instance_question_groups,
        }),
      );
    } else if (
      body.__action === 'add_manual_grade_for_instance_question_group_ungraded' ||
      body.__action === 'add_manual_grade_for_instance_question_group'
    ) {
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
        const { modified_at_conflict } = await manualGrading.updateInstanceQuestionScore(
          res.locals.assessment.id,
          instanceQuestion.instance_question_id,
          instanceQuestion.submission_id,
          null,
          {
            manual_score_perc: body.use_score_perc ? body.score_manual_percent : null,
            manual_points: body.use_score_perc ? null : body.score_manual_points,
            auto_score_perc: body.use_score_perc ? body.score_auto_percent : null,
            auto_points: body.use_score_perc ? null : body.score_auto_points,
            feedback: { manual: body.submission_note },
            manual_rubric_data,
          },
          res.locals.authn_user.user_id,
        );

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
          user_id: res.locals.authz_data.user.user_id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          use_instance_question_groups: true,
        }),
      );
    } else if (body.__action === 'modify_rubric_settings') {
      try {
        await manualGrading.updateAssessmentQuestionRubric(
          res.locals.instance_question.assessment_question_id,
          body.use_rubric,
          body.replace_auto_points,
          body.starting_points,
          body.min_points,
          body.max_extra_points,
          Object.values(body.rubric_item), // rubric items
          body.tag_for_manual_grading,
          res.locals.authn_user.user_id,
        );
        res.redirect(req.baseUrl + '/grading_rubric_panels');
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    } else if (typeof body.__action === 'string' && body.__action.startsWith('reassign_')) {
      const actionPrompt = body.__action.slice(9);
      const assigned_grader = ['nobody', 'graded'].includes(actionPrompt) ? null : actionPrompt;
      if (assigned_grader != null) {
        const courseStaff = await selectCourseInstanceGraderStaff({
          course_instance_id: res.locals.course_instance.id,
        });
        if (!courseStaff.some((staff) => idsEqual(staff.user_id, assigned_grader))) {
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
          user_id: res.locals.authz_data.user.user_id,
          prior_instance_question_id: res.locals.instance_question.id,
          skip_graded_submissions: req.session.skip_graded_submissions,
          use_instance_question_groups,
        }),
      );
    } else if (body.__action === 'report_issue') {
      await reportIssueFromForm(req, res);
      res.redirect(req.originalUrl);
    } else if (body.__action === 'toggle_ai_grading_mode') {
      await toggleAiGradingMode(res.locals.assessment_question.id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
