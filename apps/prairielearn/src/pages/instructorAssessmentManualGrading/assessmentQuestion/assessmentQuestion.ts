import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  callAsync,
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import {
  calculateAiGradingStats,
  fillInstanceQuestionColumns,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import {
  AssessmentQuestionSchema,
  GradingJobSchema,
  InstanceQuestionSchema,
} from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import * as ltiOutcomes from '../../../lib/ltiOutcomes.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestion } from './assessmentQuestion.html.js';
import { InstanceQuestionRowSchema } from './assessmentQuestion.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const courseStaff = await selectCourseInstanceGraderStaff({
      course_instance_id: res.locals.course_instance.id,
    });
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const rubric_data = await queryOptionalRow(
      sql.select_rubric_data,
      {
        assessment_question_id: res.locals.assessment_question.id,
        rubric_id: res.locals.assessment_question.manual_rubric_id,
      },
      manualGrading.RubricDataSchema,
    );
    res.send(
      AssessmentQuestion({
        resLocals: res.locals,
        courseStaff,
        aiGradingEnabled,
        aiGradingMode: aiGradingEnabled && res.locals.assessment_question.ai_grading_mode,
        aiGradingStats:
          aiGradingEnabled && res.locals.assessment_question.ai_grading_mode
            ? await calculateAiGradingStats(res.locals.assessment_question)
            : null,
        rubric_data,
      }),
    );
  }),
);

router.get(
  '/instances.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const instance_questions = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );

    res.send({
      instance_questions: await fillInstanceQuestionColumns(
        instance_questions,
        res.locals.assessment_question,
      ),
    });
  }),
);

router.get(
  '/next_ungraded',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    if (
      req.query.prior_instance_question_id != null &&
      typeof req.query.prior_instance_question_id !== 'string'
    ) {
      throw new error.HttpStatusError(400, 'prior_instance_question_id must be a single value');
    }
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question.id,
        res.locals.authz_data.user.user_id,
        req.query.prior_instance_question_id ?? null,
      ),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    // TODO: parse req.body with Zod

    if (req.body.__action === 'batch_action') {
      if (req.body.batch_action === 'ai_grade_assessment_selected') {
        if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
          throw new error.HttpStatusError(403, 'Access denied (feature not available)');
        }

        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        const jobSequenceId = await aiGrade({
          question: res.locals.question,
          course: res.locals.course,
          course_instance_id: res.locals.course_instance.id,
          assessment_question: res.locals.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'selected',
          instance_question_ids,
        });

        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        const action_data = JSON.parse(req.body.batch_action_data) || {};
        const instance_question_ids = Array.isArray(req.body.instance_question_id)
          ? req.body.instance_question_id
          : [req.body.instance_question_id];
        if (action_data?.assigned_grader != null) {
          const courseStaff = await selectCourseInstanceGraderStaff({
            course_instance_id: res.locals.course_instance.id,
          });
          if (!courseStaff.some((staff) => idsEqual(staff.user_id, action_data.assigned_grader))) {
            throw new error.HttpStatusError(
              400,
              'Assigned grader does not have Student Data Editor permission',
            );
          }
        }
        await queryAsync(sql.update_instance_questions, {
          assessment_question_id: res.locals.assessment_question.id,
          instance_question_ids,
          update_requires_manual_grading: 'requires_manual_grading' in action_data,
          requires_manual_grading: !!action_data?.requires_manual_grading,
          update_assigned_grader: 'assigned_grader' in action_data,
          assigned_grader: action_data?.assigned_grader,
        });
        res.send({});
      }
    } else if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at ? new Date(req.body.modified_at) : null, // check_modified_at
        {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
          score_perc: req.body.score_perc,
        },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.send({});
      }
    } else if (req.body.__action === 'toggle_ai_grading_mode') {
      await queryAsync(sql.toggle_ai_grading_mode, {
        assessment_question_id: res.locals.assessment_question.id,
      });
      res.redirect(req.originalUrl);
    } else if (
      ['ai_grade_assessment', 'ai_grade_assessment_graded', 'ai_grade_assessment_all'].includes(
        req.body.__action,
      )
    ) {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      const jobSequenceId = await aiGrade({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
        mode: run(() => {
          if (req.body.__action === 'ai_grade_assessment_graded') return 'human_graded';
          if (req.body.__action === 'ai_grade_assessment_all') return 'all';
          throw new Error(`Unknown action: ${req.body.__action}`);
        }),
      });

      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'delete_ai_grading_jobs') {
      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }

      // TODO: revisit this before general availability of AI grading. This implementation
      // was added primarily to facilitate demos at ASEE 2025. It may not behave completely
      // correctly in call cases; see the TODOs in the SQL query for more details.
      //
      // TODO: we should add locking here. Specifically, we should process each
      // assessment instance + instance question one at a time in separate
      // transactions so that we don't need to lock all relevant assessment instances
      // and assessment questions at once.
      const iqs = await runInTransactionAsync(async () => {
        const iqs = await queryRows(
          sql.delete_ai_grading_jobs,
          {
            authn_user_id: res.locals.authn_user.user_id,
            assessment_question_id: res.locals.assessment_question.id,
          },
          z.object({
            id: IdSchema,
            assessment_instance_id: IdSchema,
            max_points: AssessmentQuestionSchema.shape.max_points,
            max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
            max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
            points: InstanceQuestionSchema.shape.points,
            score_perc: InstanceQuestionSchema.shape.score_perc,
            auto_points: InstanceQuestionSchema.shape.auto_points,
            manual_points: InstanceQuestionSchema.shape.manual_points,
            most_recent_manual_grading_job: GradingJobSchema.nullable(),
          }),
        );

        for (const iq of iqs) {
          await callAsync('assessment_instances_grade', [
            iq.assessment_instance_id,
            // We use the user who is performing the deletion.
            res.locals.authn_user.user_id,
            100, // credit
            false, // only_log_if_score_updated
            true, // allow_decrease
          ]);
        }

        return iqs;
      });

      // Important: this is done outside of the above transaction so that we don't
      // hold a database connection open while we do network calls.
      //
      // This is here for consistency with other assessment score updating code. We
      // shouldn't hit this for the vast majority of assessments.
      for (const iq of iqs) {
        await ltiOutcomes.updateScore(iq.assessment_instance_id);
      }

      flash(
        'success',
        `Deleted AI grading results for ${iqs.length} ${iqs.length === 1 ? 'question' : 'questions'}.`,
      );

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
