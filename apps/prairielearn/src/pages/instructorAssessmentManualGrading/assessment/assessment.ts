import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { stringify } from '@prairielearn/csv';
import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { generateAssessmentAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import { deleteAiGradingJobs } from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { selectAssessmentQuestions } from '../../../lib/assessment-question.js';
import { type Assessment } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { ManualGradingAssessment, ManualGradingQuestionSchema } from './assessment.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  asyncHandler(async (req, res) => {
    const questions = await queryRows(
      sql.select_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.authz_data.user.user_id,
      },
      ManualGradingQuestionSchema,
    );
    const num_open_instances = questions[0]?.num_open_instances || 0;
    const courseStaff = await selectCourseInstanceGraderStaff({
      course_instance: res.locals.course_instance,
    });
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    res.send(
      ManualGradingAssessment({
        resLocals: res.locals,
        questions,
        courseStaff,
        num_open_instances,
        adminFeaturesEnabled: aiGradingEnabled && res.locals.is_administrator,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    if (req.body.__action === 'assign_graders') {
      if (!req.body.assigned_grader) {
        flash('error', 'No graders were selected for assignment.');
        res.redirect(req.originalUrl);
        return;
      }
      const assignedGraderIds: string[] = Array.isArray(req.body.assigned_grader)
        ? req.body.assigned_grader
        : [req.body.assigned_grader];
      const allowedGraderIds = new Set(
        (
          await selectCourseInstanceGraderStaff({
            course_instance: res.locals.course_instance,
          })
        ).map((user) => user.user_id),
      );
      if (assignedGraderIds.some((graderId) => !allowedGraderIds.has(graderId))) {
        flash(
          'error',
          'Selected graders do not have student data editor access to this course instance.',
        );
        res.redirect(req.originalUrl);
        return;
      }
      await runInTransactionAsync(async () => {
        const numInstancesToGrade = await queryOptionalRow(
          sql.count_instance_questions_to_grade,
          {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
          },
          z.number(),
        );
        if (!numInstancesToGrade) {
          flash('warning', 'No instances to assign.');
          return;
        }
        // We use ceil to ensure that all instances are graded, even if the
        // division is not exact. The last grader may not be assigned the same
        // number of instances as the others, and that is expected.
        const numInstancesPerGrader = Math.ceil(numInstancesToGrade / assignedGraderIds.length);
        for (const graderId of assignedGraderIds) {
          await execute(sql.update_instance_question_graders, {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
            assigned_grader: graderId,
            limit: numInstancesPerGrader,
          });
        }
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'ai_grade_all') {
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!aiGradingEnabled) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      const model_id = req.body.model_id as AiGradingModelId | undefined;

      if (!model_id) {
        throw new HttpStatusError(400, 'No AI grading model specified');
      }

      const aiGradingModelSelectionEnabled = await features.enabledFromLocals(
        'ai-grading-model-selection',
        res.locals,
      );

      if (!aiGradingModelSelectionEnabled && model_id !== DEFAULT_AI_GRADING_MODEL) {
        throw new HttpStatusError(
          403,
          `AI grading model selection not available. Must use default model: ${DEFAULT_AI_GRADING_MODEL}`,
        );
      }

      const assessment = res.locals.assessment as Assessment;

      const assessmentQuestionRows = await selectAssessmentQuestions({
        assessment_id: assessment.id,
      });

      // AI grading runs only on manually graded questions.
      const manuallyGradedRows = assessmentQuestionRows.filter(
        (row) => row.assessment_question.max_manual_points,
      );

      if (manuallyGradedRows.length === 0) {
        flash('warning', 'No manually graded assessment questions found for AI grading.');
        res.redirect(req.originalUrl);
        return;
      }

      for (const row of manuallyGradedRows) {
        await aiGrade({
          question: row.question,
          course: res.locals.course,
          course_instance: res.locals.course_instance,
          assessment,
          assessment_question: row.assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          model_id,
          mode: 'all',
        });
      }
      flash('success', 'AI grading successfully initiated.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'export_ai_grading_statistics') {
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!aiGradingEnabled) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      const stats = await generateAssessmentAiGradingStats(res.locals.assessment as Assessment);
      res.attachment('assessment_statistics.csv');
      stringify([...stats.perQuestion, stats.total], {
        header: true,
        columns: [
          'assessmentQuestionId',
          'questionNumber',
          'truePositives',
          'trueNegatives',
          'falsePositives',
          'falseNegatives',
          'accuracy',
          'precision',
          'recall',
          'f1score',
        ],
      }).pipe(res);
    } else if (req.body.__action === 'delete_ai_grading_data') {
      if (!res.locals.is_administrator) {
        throw new HttpStatusError(403, 'Access denied');
      }

      if (!(await features.enabledFromLocals('ai-grading', res.locals))) {
        throw new HttpStatusError(403, 'Access denied (feature not available)');
      }

      const assessment = res.locals.assessment as Assessment;
      const assessmentQuestionRows = await selectAssessmentQuestions({
        assessment_id: assessment.id,
      });

      await deleteAiGradingJobs({
        assessment_question_ids: assessmentQuestionRows.map((row) => row.assessment_question.id),
        authn_user_id: res.locals.authn_user.user_id,
      });

      flash('success', 'AI grading data deleted successfully.');
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
