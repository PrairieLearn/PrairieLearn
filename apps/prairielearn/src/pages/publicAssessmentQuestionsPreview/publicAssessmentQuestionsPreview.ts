import { AnsiUp } from 'ansi_up';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { queryRow, queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { AssessmentQuestionRowSchema } from '../../models/questions.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestionsPreview.html.js';

import { z } from 'zod';

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
  const isPublic = await queryRow(
    sql.check_assessment_is_public,
    { assessment_id },
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
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id.toString());
    const course = await selectCourseById(courseId);
    res.locals.course = course;

    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'This assessment is not public.');
    }

    res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);
    const questionRows = await queryRows(
      sql.select_assessment_questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionRowSchema,
    );
    
    const questions = questionRows.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);

      // Validate and parse open_issue_count
      if (typeof row.open_issue_count !== 'number' || isNaN(row.open_issue_count)) {
        row.open_issue_count = 0;
      }

      return row;
    });
    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
  }),
);

export default router;
