import asyncHandler = require('express-async-handler');

import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';
import { AssessmentSetSchema } from '../../lib/db-types';
import { InstructorCourseAdminSets } from './instructorCourseAdminSets.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

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
