import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_user_scores, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

export default router;
