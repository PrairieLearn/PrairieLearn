import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { TagSchema } from '../../lib/db-types.js';

import { InstructorCourseAdminTags } from './instructorCourseAdminTags.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

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
