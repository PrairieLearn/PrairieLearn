// @ts-check
import { Router } from 'express';
const asyncHandler = require('express-async-handler');
import * as sqldb from '@prairielearn/postgres';

const sql = sqldb.loadSqlEquiv(__filename);
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await sqldb.queryAsync(sql.select_news_items, {
      user_id: res.locals.authn_user.user_id,
      course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
      course_id: res.locals.course ? res.locals.course.id : null,
    });
    res.locals.news_items = result.rows;

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
