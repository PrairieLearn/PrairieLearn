import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectAssessmentQuestions } from '../../models/questions.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestionsPreview.html.js';

async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return await queryRow(
    sql.select_assessment_by_id,
    {
      assessment_id,
    },
    AssessmentSchema,
  );
}

const BooleanSchema = z.boolean();

async function checkAssessmentPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, BooleanSchema);
  return isPublic;
}

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id.toString());
    const course = await selectCourseById(courseId);
    res.locals.course = course;

    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'This assessment is not public.');
    }

    res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);
    const questions = await selectAssessmentQuestions(res.locals.assessment_id, courseId);

    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
  }),
);

export default router;
