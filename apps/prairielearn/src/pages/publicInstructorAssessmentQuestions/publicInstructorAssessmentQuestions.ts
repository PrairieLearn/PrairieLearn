import { AnsiUp } from 'ansi_up';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { queryRow, queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { Assessment, AssessmentSchema } from '../../db-types.js';

import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { selectCourseById } from '../../models/course.js';

import {
  InstructorAssessmentQuestions,
  AssessmentQuestionRowSchema,
} from './publicInstructorAssessmentQuestions.html.js';

async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return await queryRow(
    sql.select_course_by_id,
    {
      assessment_id,
    },
    AssessmentSchema,
  );
}

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    console.log('In publicInstructorAssessmentQuestions.ts'); // TEST
    res.locals.course = await selectCourseById(req.params.course_id);
    res.locals.assessment = await selectAssessmentById(req.params.assessment_id);
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

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
