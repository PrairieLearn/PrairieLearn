import * as path from 'node:path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = express.Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_course_instance_access_rules, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

export default router;
