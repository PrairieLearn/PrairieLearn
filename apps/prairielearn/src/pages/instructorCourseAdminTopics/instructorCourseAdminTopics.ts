import asyncHandler = require('express-async-handler');
import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';
import { TopicSchema } from '../../lib/db-types';
import { InstructorCourseAdminTopics } from './instructorCourseAdminTopics.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

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
