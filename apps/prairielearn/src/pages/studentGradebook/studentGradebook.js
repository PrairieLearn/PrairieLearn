// @ts-check
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_assessment_instances, {
      course_instance_id: res.locals.course_instance.id,
      user_id: res.locals.user.user_id,
      authz_data: res.locals.authz_data,
      req_date: res.locals.req_date,
    });
    res.locals.rows = result.rows;
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
