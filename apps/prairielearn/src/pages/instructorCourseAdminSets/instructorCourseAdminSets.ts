import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentSetSchema } from '../../lib/db-types.js';

import { InstructorCourseAdminSets } from './instructorCourseAdminSets.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: res.locals.course.id },
      AssessmentSetSchema,
    );

    res.send(InstructorCourseAdminSets({ resLocals: res.locals, assessmentSets }));
  }),
);

export default router;
