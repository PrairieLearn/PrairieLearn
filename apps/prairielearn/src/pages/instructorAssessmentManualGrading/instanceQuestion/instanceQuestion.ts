import * as express from 'express';
import asyncHandler = require('express-async-handler');
import * as qs from 'qs';
import { z } from 'zod';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getAndRenderVariant, renderPanelsForSubmission } from '../../../lib/question-render';
import * as manualGrading from '../../../lib/manualGrading';
import { IdSchema, UserSchema } from '../../../lib/db-types';
import { GradingJobData, GradingJobDataSchema, InstanceQuestion } from './instanceQuestion.html';
import { GradingPanel } from './gradingPanel.html';
import { RubricSettingsModal } from './rubricSettingsModal.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

async function prepareLocalsForRender(query: Record<string, any>, resLocals: Record<string, any>) {
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
    throw error.make(404, 'Instance question does not have a gradable submission.');
  }
  resLocals.manualGradingInterface = true;
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

  const graders = await sqldb.queryOptionalRow(
    sql.select_graders,
    { course_instance_id: resLocals.course_instance.id },
    UserSchema.array().nullable(),
  );
  return { resLocals, conflict_grading_job, graders };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }

    res.send(InstanceQuestion(await prepareLocalsForRender(req.query, res.locals)));
  }),
);

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res) => {
    const results = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: res.locals.instance_question.id,
      variant_id: req.params.variant_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: null,
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel: results.submissionPanel });
  }),
);

router.get(
  '/grading_rubric_panels',
  asyncHandler(async (req, res) => {
    try {
      const locals = await prepareLocalsForRender({}, res.locals);
      const gradingPanel = GradingPanel({ ...locals, context: 'main' }).toString();
      const rubricSettings = RubricSettingsModal(locals).toString();
      res.send({ gradingPanel, rubricSettings });
    } catch (err) {
      res.send({ err: String(err) });
    }
  }),
);

const PostBodySchema = z.union([
  z.object({
    __action: z.literal('add_manual_grade'),
    submission_id: IdSchema,
    modified_at: z.string(),
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
]);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
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
          body.modified_at,
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
      res.redirect(
        await manualGrading.nextUngradedInstanceQuestionUrl(
          res.locals.urlPrefix,
          res.locals.assessment.id,
          res.locals.assessment_question.id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id,
        ),
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
      const assigned_grader = body.__action.substring(9);
      await sqldb.queryAsync(sql.update_assigned_grader, {
        course_instance_id: res.locals.course_instance.id,
        assessment_id: res.locals.assessment.id,
        instance_question_id: res.locals.instance_question.id,
        assigned_grader: ['nobody', 'graded'].includes(assigned_grader) ? null : assigned_grader,
        requires_manual_grading: assigned_grader !== 'graded',
      });

      res.redirect(
        await manualGrading.nextUngradedInstanceQuestionUrl(
          res.locals.urlPrefix,
          res.locals.assessment.id,
          res.locals.assessment_question.id,
          res.locals.authz_data.user.user_id,
          res.locals.instance_question.id,
        ),
      );
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
