import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryOneRowAsync } from '@prairielearn/postgres';

import { copyQuestionBetweenCourses } from '../../lib/copy-question';
import { idsEqual } from '../../lib/id';

const router = Router();
const sql = loadSqlEquiv(__filename);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      // The ID of the question to copy.
      question_id,
      // The ID of the course to copy the question from.
      course_id,
    } = req.body;

    console.log(question_id, course_id);

    // It doesn't make much sense to transfer a template course question to
    // the same template course, so we'll explicitly forbid that.
    if (idsEqual(course_id, res.locals.course.id)) {
      throw error.make(400, 'Template course questions cannot be transferred to the same course.');
    }

    // This query will do two things: validate that the question belongs to
    // the given course, and validate that the course is a template course.
    const result = await queryOneRowAsync(sql.select_question, {
      question_id,
      course_id,
    });

    // `copyQuestion` expects this to be populated.
    res.locals.question = result.rows[0];

    await copyQuestionBetweenCourses(res, {
      fromCourse: course_id,
      toCourseId: res.locals.course.id,
    });
  })
);

export default router;
