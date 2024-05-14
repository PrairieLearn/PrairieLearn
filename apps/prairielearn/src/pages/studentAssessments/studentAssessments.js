// @ts-check
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_assessments, {
      course_instance_id: res.locals.course_instance.id,
      authz_data: res.locals.authz_data,
      user_id: res.locals.user.user_id,
      req_date: res.locals.req_date,
      assessments_group_by: res.locals.course_instance.assessments_group_by,
    });
    res.locals.rows = result.rows;
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
