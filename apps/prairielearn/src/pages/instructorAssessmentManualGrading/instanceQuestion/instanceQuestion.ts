import * as express from 'express';
import asyncHandler from 'express-async-handler';
import qs from 'qs';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { IdSchema } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import { reportIssueFromForm } from '../../../lib/issues.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { getAndRenderVariant, renderPanelsForSubmission } from '../../../lib/question-render.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { GradingPanel } from './gradingPanel.html.js';
import {
  type GradingJobData,
  GradingJobDataSchema,
  InstanceQuestion,
} from './instanceQuestion.html.js';
import { RubricSettingsModal } from './rubricSettingsModal.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

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
    throw new error.HttpStatusError(404, 'Instance question does not have a gradable submission.');
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

  const graders = await selectCourseInstanceGraderStaff({
    course_instance_id: resLocals.course_instance.id,
  });
  return { resLocals, conflict_grading_job, graders };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    res.send(InstanceQuestion(await prepareLocalsForRender(req.query, res.locals)));
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    const { submissionPanel, extraHeadersHtml } = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: res.locals.instance_question.id,
      variant_id: req.params.variant_id,
      user_id: res.locals.user.user_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'manual_grading',
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel, extraHeadersHtml });
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
    unsafe_issue_ids_close: IdSchema.or(z.record(z.string(), IdSchema))
      .nullish()
      .transform((val) =>
        val == null ? [] : typeof val === 'string' ? [val] : Object.values(val),
      ),
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
      // Only close issues if the submission was successfully graded
      if (body.unsafe_issue_ids_close.length > 0) {
        await sqldb.queryAsync(sql.close_issues_for_instance_question, {
          issue_ids: body.unsafe_issue_ids_close,
          instance_question_id: res.locals.instance_question.id,
          authn_user_id: res.locals.authn_user.user_id,
        });
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
      const actionPrompt = body.__action.substring(9);
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
      await sqldb.queryAsync(sql.update_assigned_grader, {
        instance_question_id: res.locals.instance_question.id,
        assigned_grader,
        requires_manual_grading: actionPrompt !== 'graded',
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
    } else if (body.__action === 'report_issue') {
      await reportIssueFromForm(req, res);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
