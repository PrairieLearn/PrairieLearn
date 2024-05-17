import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

import { TopicSchema } from '../../lib/db-types.js';

import { InstructorCourseAdminTopics } from './instructorCourseAdminTopics.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const topics = await sqldb.queryRows(
      sql.select_topics,
      { course_id: res.locals.course.id },
      TopicSchema,
    );

    res.send(InstructorCourseAdminTopics({ resLocals: res.locals, topics }));
  }),
);

export default router;
