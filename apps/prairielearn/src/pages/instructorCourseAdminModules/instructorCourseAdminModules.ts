import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { AssessmentModuleSchema } from '../../lib/db-types.js';

import { InstructorCourseAdminModules } from './instructorCourseAdminModules.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const modules = await sqldb.queryRows(
      sql.select_assessment_modules,
      { course_id: res.locals.course.id },
      AssessmentModuleSchema,
    );

    res.send(InstructorCourseAdminModules({ resLocals: res.locals, modules }));
  }),
);

export default router;
