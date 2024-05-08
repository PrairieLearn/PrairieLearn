import asyncHandler = require('express-async-handler');

import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';
import { TagSchema } from '../../lib/db-types';
import { InstructorCourseAdminTags } from './instructorCourseAdminTags.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tags = await sqldb.queryRows(
      sql.select_tags,
      { course_id: res.locals.course.id },
      TagSchema,
    );

    res.send(InstructorCourseAdminTags({ resLocals: res.locals, tags }));
  }),
);

export default router;
