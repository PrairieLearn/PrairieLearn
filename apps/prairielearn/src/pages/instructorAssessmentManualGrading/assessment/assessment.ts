import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import type { Assessment, AssessmentQuestion } from '../../../lib/db-types.js';
import { selectAssessmentQuestions } from '../../../models/assessment-question.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectQuestionById } from '../../../models/question.js';

import { ManualGradingAssessment, ManualGradingQuestionSchema } from './assessment.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
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
      course_instance_id: res.locals.course_instance.id,
    });
    res.send(
      ManualGradingAssessment({
        resLocals: res.locals,
        questions,
        courseStaff,
        num_open_instances,
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
      const allowedGraderIds = (
        await selectCourseInstanceGraderStaff({
          course_instance_id: res.locals.course_instance.id,
        })
      ).map((user) => user.user_id);
      if (assignedGraderIds.some((graderId) => !allowedGraderIds.includes(graderId))) {
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
          await queryAsync(sql.update_instance_question_graders, {
            assessment_id: res.locals.assessment.id,
            unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
            assigned_grader: graderId,
            limit: numInstancesPerGrader,
          });
        }
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'ai_grade_assessment_all') {
      const assessment = res.locals.assessment as Assessment;
      const assessment_questions = await selectAssessmentQuestions(assessment.id) as AssessmentQuestion[];
      if (!assessment_questions) {
        console.log(`No questions found for assessment ${assessment.id}`);
        return;
      }
      for (let i = 0; i < assessment_questions.length; i++) {
        const assessment_question = assessment_questions[i];
        const question = await selectQuestionById(assessment_question.question_id);
        
        console.log(`AI grading question ${assessment_question.question_id} (${i + 1}/${assessment_questions.length})`);
        await aiGrade({
          question,
          course: res.locals.course,
          course_instance_id: assessment.course_instance_id,
          assessment_question,
          urlPrefix: res.locals.urlPrefix,
          authn_user_id: res.locals.authn_user.user_id,
          user_id: res.locals.user.user_id,
          mode: 'all'
        });
      }

      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
