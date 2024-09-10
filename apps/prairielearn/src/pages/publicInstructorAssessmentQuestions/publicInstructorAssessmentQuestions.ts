import { AnsiUp } from 'ansi_up';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { queryRow, queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';

import {
  InstructorAssessmentQuestions,
  AssessmentQuestionRowSchema,
} from './publicInstructorAssessmentQuestions.html.js';

import { z } from 'zod';

// TEST, put in different file (like assessments.ts)?
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

async function checkCourseInstancePublic(course_instance_id: string): Promise<boolean> {
  const isPublic = await queryRow(
    sql.check_course_instance_is_public,
    { course_instance_id },
    BooleanSchema,
  );
  return isPublic;
}

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isCourseInstancePublic = await checkCourseInstancePublic(res.locals.course_instance_id);
    if (!isCourseInstancePublic) {
      throw new error.HttpStatusError(
        404,
        'The course instance that owns this assessment is not public.',
      );
    }

    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id.toString());
    const course = await selectCourseById(courseId);



    res.locals.course = course;
    res.locals.urlPrefix = `/pl/public/course/${res.locals.course.id}`;
    res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);
    const questionRows = await queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionRowSchema,
    );
    const questions = questionRows.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
  }),
);

export default router;
