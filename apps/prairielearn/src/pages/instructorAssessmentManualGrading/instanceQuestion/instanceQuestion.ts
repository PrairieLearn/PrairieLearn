import * as express from 'express';
import asyncHandler = require('express-async-handler');
import * as util from 'util';
import * as qs from 'qs';
import * as ejs from 'ejs';
import * as path from 'path';
import { z } from 'zod';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import * as question from '../../../lib/question';
import * as manualGrading from '../../../lib/manualGrading';
import { features } from '../../../lib/features/index';
import { IdSchema, UserSchema } from '../../../lib/db-types';
import { GradingJobData, GradingJobDataSchema, InstanceQuestion } from './instanceQuestion.html';

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
  await util.promisify(question.getAndRenderVariant)(variant_with_submission_id, null, resLocals);

  const rubric_settings_visible = await features.enabledFromLocals(
    'manual-grading-rubrics',
    resLocals,
  );

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
      await manualGrading.populateManualGradingData(resLocals.conflict_grading_job);
    }
  }

  const graders = await sqldb.queryOptionalRow(
    sql.select_graders,
    { course_instance_id: resLocals.course_instance.id },
    UserSchema.array().nullable(),
  );
  return { rubric_settings_visible, conflict_grading_job, graders };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }

    const locals = await prepareLocalsForRender(req.query, res.locals);
    res.send(InstanceQuestion({ resLocals: res.locals, ...locals }));
  }),
);

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res) => {
    const results = await util.promisify(question.renderPanelsForSubmission)(
      req.params.submission_id,
      res.locals.question.id,
      res.locals.instance_question.id,
      req.params.variant_id,
      res.locals.urlPrefix,
      null, // questionContext
      null, // csrfToken
      null, // authorizedEdit
      false, // renderScorePanels
    );
    res.send({ submissionPanel: results.submissionPanel });
  }),
);

router.get(
  '/grading_rubric_panels',
  asyncHandler(async (req, res) => {
    try {
      const locals = await prepareLocalsForRender({}, res.locals);
      // Using util.promisify on renderFile instead of {async: true} from EJS, because the
      // latter would require all includes in EJS to be translated to await recursively.
      const gradingPanel = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'gradingPanel.ejs'),
        { context: 'main', ...res.locals, ...locals },
      );
      const rubricSettings = await util.promisify(ejs.renderFile)(
        path.join(__dirname, 'rubricSettingsModal.ejs'),
        { ...res.locals, ...locals },
      );
      res.send({ gradingPanel, rubricSettings });
    } catch (err) {
      res.send({ err: String(err) });
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }
    if (req.body.__action === 'add_manual_grade') {
      const body = z
        .object({
          submission_id: IdSchema,
          modified_at: z.string(),
          rubric_item_selected_manual: IdSchema.or(IdSchema.array())
            .nullish()
            .transform((val) => (val == null ? [] : Array.isArray(val) ? val : [val])),
          score_manual_adjust_points: z.coerce.number().nullish(),
          use_score_perc: z.literal('on').optional(),
          score_manual_points: z.coerce.number().nullish(),
          score_manual_percent: z.coerce.number().nullish(),
          score_auto_points: z.coerce.number().nullish(),
          score_auto_percent: z.coerce.number().nullish(),
          submission_note: z.string().nullish(),
        })
        .parse(req.body);
      let manual_rubric_data: {
        rubric_id: string;
        applied_rubric_items: manualGrading.AppliedRubricItem[];
        adjust_points: number | null;
      } | null = null;
      if (res.locals.assessment_question.manual_rubric_id) {
        const manual_rubric_items = body.rubric_item_selected_manual;
        manual_rubric_data = {
          rubric_id: res.locals.assessment_question.manual_rubric_id,
          applied_rubric_items: manual_rubric_items.map((id) => ({ rubric_item_id: id })),
          adjust_points: body.score_manual_adjust_points || null,
        };
      }

      const { modified_at_conflict, grading_job_id } =
        await manualGrading.updateInstanceQuestionScore(
          res.locals.assessment.id,
          res.locals.instance_question.id,
          body.submission_id,
          body.modified_at,
          {
            manual_score_perc: body.use_score_perc ? body.score_manual_percent : null,
            manual_points: body.use_score_perc ? null : body.score_manual_points,
            auto_score_perc: body.use_score_perc ? body.score_auto_percent || null : null,
            auto_points: body.use_score_perc ? null : body.score_auto_points || null,
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
    } else if (req.body.__action === 'modify_rubric_settings') {
      // Parse using qs, which allows deep objects to be created based on parameter names
      // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
      const rubric_items = Object.values(qs.parse(qs.stringify(req.body)).rubric_item || {}).map(
        (item: manualGrading.RubricItemInput) => ({
          ...item,
          always_show_to_students: item.always_show_to_students === 'true',
        }),
      );
      try {
        await manualGrading.updateAssessmentQuestionRubric(
          res.locals.instance_question.assessment_question_id,
          req.body.use_rubric === 'true',
          req.body.replace_auto_points === 'true',
          req.body.starting_points,
          req.body.min_points,
          req.body.max_extra_points,
          rubric_items,
          !!req.body.tag_for_manual_grading,
          res.locals.authn_user.user_id,
        );
        res.redirect(req.baseUrl + '/grading_rubric_panels');
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    } else if (typeof req.body.__action === 'string' && req.body.__action.startsWith('reassign_')) {
      const assigned_grader = req.body.__action.substring(9);
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
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;
