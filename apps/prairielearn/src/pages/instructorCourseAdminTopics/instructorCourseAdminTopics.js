// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';

import * as sqldb from '@prairielearn/postgres';
import { TopicSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.topics = await sqldb.queryRows(
      sql.select_topics,
      { course_id: res.locals.course.id },
      TopicSchema,
    );

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
