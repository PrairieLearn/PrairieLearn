import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';



const sql = sqldb.loadSql(path.join(fileURLToPath(import.meta.url), '..', '..', 'queries.sql'));
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryOneRowAsync(sql.select_course_instance_info, {
      course_instance_id: res.locals.course_instance.id,
    });
    res.status(200).send(result.rows[0].item);
  }),
);

export default router;
